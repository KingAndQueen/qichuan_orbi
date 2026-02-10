// Package main imports account data into site-auth.
// main 包用于向 site-auth 导入账号数据。
package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"

	"log/slog"

	"github.com/orbit-work/site-auth/internal/config"
	"github.com/orbit-work/site-auth/internal/logging"
	"github.com/orbit-work/site-auth/internal/password"
)

type inputFormat string // inputFormat enumerates supported formats./inputFormat 表示支持的文件格式。

const (
	formatCSV  inputFormat = "csv"
	formatJSON inputFormat = "json"
)

type accountRecord struct {
	Username    string `json:"username"`    // Username is the login identifier./用户名为登录标识。
	DisplayName string `json:"displayName"` // DisplayName is shown to users./显示名在界面展示。
	Password    string `json:"password"`    // Password may be plaintext or bcrypt hash./密码可为明文或 bcrypt 哈希。
	Email       string `json:"email"`       // Email is optional contact info./电子邮箱为可选联系方式。
	Phone       string `json:"phone"`       // Phone is optional contact info./电话为可选联系方式。
}

var logger = slog.Default()

// main parses CLI flags and orchestrates the import./main 解析命令行参数并执行导入。
func main() {
	filePath := flag.String("file", "", "账号文件路径，支持 csv 或 json")
	format := flag.String("format", "csv", "文件格式：csv 或 json")
	flag.Parse()

	if *filePath == "" {
		exitWithError(errors.New("必须通过 --file 指定账号文件路径"))
	}

	cfg, err := config.FromEnv()
	if err != nil {
		exitWithError(fmt.Errorf("加载配置失败: %w", err))
	}

	logger = logging.Setup(cfg.LogLevel)

	data, err := os.Open(*filePath)
	if err != nil {
		exitWithError(fmt.Errorf("读取文件失败: %w", err))
	}
	defer data.Close()

	records, err := parseAccounts(data, inputFormat(strings.ToLower(*format)))
	if err != nil {
		exitWithError(err)
	}

	if len(records) == 0 {
		logger.Warn("未找到需要导入的账号", "path", *filePath)
		return
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.PostgresURL)
	if err != nil {
		exitWithError(fmt.Errorf("连接数据库失败: %w", err))
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		exitWithError(fmt.Errorf("开启事务失败: %w", err))
	}
	// Defer rollback, it's a no-op if Commit() succeeds
	defer tx.Rollback(ctx)

	stmt := `
        INSERT INTO site_accounts (username, display_name, password_hash, status, email, phone)
        VALUES ($1, $2, $3, 'active', $4, $5)
        ON CONFLICT (username)
        DO UPDATE SET display_name = EXCLUDED.display_name,
                      password_hash = EXCLUDED.password_hash,
                      status = 'active',
                      email = COALESCE(EXCLUDED.email, site_accounts.email),
                      phone = COALESCE(EXCLUDED.phone, site_accounts.phone),
                      updated_at = NOW()
    `

	for _, record := range records {
		passwordHash := normalizePassword(record.Password, cfg.BcryptCost)

		email := normalizeEmail(record.Email)
		phone := normalizePhone(record.Phone)
		if _, err := tx.Exec(ctx, stmt, record.Username, record.DisplayName, passwordHash, email, phone); err != nil {
			// Rollback is deferred, just exit
			exitWithError(fmt.Errorf("写入账号失败(%s): %w", record.Username, err))
		}
	}

	if err := tx.Commit(ctx); err != nil {
		exitWithError(fmt.Errorf("提交事务失败: %w", err))
	}

	logger.Info("账号导入完成", "count", len(records), "path", *filePath)
}

// ---------- 自动判断明文 / 哈希 Auto-detect plaintext or hash ----------
// normalizePassword converts plaintext to bcrypt or keeps provided hashes./normalizePassword 将明文转换为 bcrypt 或保留已有哈希。
func normalizePassword(raw string, cost int) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		exitWithError(errors.New("密码为空"))
	}
	// Detect existing bcrypt strings to avoid double hashing./检测已存在的 bcrypt 字符串以避免重复加密。
	if strings.HasPrefix(trimmed, "$2a$") || strings.HasPrefix(trimmed, "$2b$") || strings.HasPrefix(trimmed, "$2y$") {
		return trimmed
	}
	hashed, err := password.Hash(trimmed, cost)
	if err != nil {
		exitWithError(fmt.Errorf("密码加密失败: %w", err))
	}
	return hashed
}

// parseAccounts chooses the right parser based on format./parseAccounts 根据格式选择解析器。
func parseAccounts(r io.Reader, format inputFormat) ([]accountRecord, error) {
	switch format {
	case formatCSV:
		return parseCSV(r)
	case formatJSON:
		return parseJSON(r)
	default:
		return nil, fmt.Errorf("未知的文件格式: %s", format)
	}
}

// parseCSV converts CSV rows into account records./parseCSV 将 CSV 行转换为账号记录。
func parseCSV(r io.Reader) ([]accountRecord, error) {
	reader := csv.NewReader(r)
	reader.TrimLeadingSpace = true
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("解析 CSV 失败: %w", err)
	}
	var records []accountRecord
	for idx, row := range rows {
		// Need at least username, display name, and password columns./至少需要用户名、显示名和密码三列。
		if len(row) < 3 {
			return nil, fmt.Errorf("第 %d 行列数不足，期望至少 3 列", idx+1)
		}
		record := accountRecord{
			Username:    strings.TrimSpace(row[0]),
			DisplayName: strings.TrimSpace(row[1]),
			Password:    strings.TrimSpace(row[2]),
		}
		if len(row) > 3 {
			record.Email = strings.TrimSpace(row[3])
		}
		if len(row) > 4 {
			record.Phone = strings.TrimSpace(row[4])
		}
		if record.Username == "" || record.Password == "" {
			return nil, fmt.Errorf("第 %d 行账号或密码为空", idx+1)
		}
		records = append(records, record)
	}
	return records, nil
}

// parseJSON converts a JSON array into account records./parseJSON 将 JSON 数组转换为账号记录。
func parseJSON(r io.Reader) ([]accountRecord, error) {
	var records []accountRecord
	if err := json.NewDecoder(r).Decode(&records); err != nil {
		return nil, fmt.Errorf("解析 JSON 失败: %w", err)
	}
	for i := range records {
		records[i].Username = strings.TrimSpace(records[i].Username)
		records[i].DisplayName = strings.TrimSpace(records[i].DisplayName)
		records[i].Password = strings.TrimSpace(records[i].Password)
		records[i].Email = strings.TrimSpace(records[i].Email)
		records[i].Phone = strings.TrimSpace(records[i].Phone)
		if records[i].Username == "" || records[i].Password == "" {
			return nil, fmt.Errorf("第 %d 条数据账号或密码为空", i+1)
		}
	}
	return records, nil
}

// normalizeEmail standardises email casing and empties./normalizeEmail 标准化邮箱大小写并处理空值。
func normalizeEmail(value string) interface{} {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return strings.ToLower(trimmed)
}

// normalizePhone strips formatting and validates phone numbers./normalizePhone 去除格式并校验电话。
// [FIXED] Added missing function signature.
func normalizePhone(value string) interface{} {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	var builder strings.Builder
	for idx, r := range trimmed {
		switch {
		case unicode.IsDigit(r):
			builder.WriteRune(r)
		case r == '+' && builder.Len() == 0 && idx == 0:
			builder.WriteRune(r)
		case r == '-' || r == ' ' || r == '(' || r == ')':
			continue
		default:
			// Invalid character, treat as nil
			return nil
		}
	}
	normalized := builder.String()
	if normalized == "" {
		return nil
	}
	if strings.HasPrefix(normalized, "+") {
		if len(normalized) <= 4 { // e.g., "+86" is too short
			return nil
		}
		return normalized
	}
	if len(normalized) < 6 { // Arbitrary minimum length for local number
		return nil
	}
	return normalized
}

// exitWithError logs the error and terminates the process./exitWithError 记录错误并终止进程。
func exitWithError(err error) {
	logger.Error("导入失败", "err", err)
	os.Exit(1)
}