// Package password encapsulates hashing utilities./password 包封装密码哈希工具。
package password

import (
	"crypto/rand"
	"math/big"
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

// Generate creates a cryptographically secure random password of the given length.
func Generate(length int) (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	if length < 8 {
		length = 8
	}
	b := make([]byte, length)
	for i := range b {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		b[i] = charset[num.Int64()]
	}
	return string(b), nil
}

// sanitize removes whitespace including invisible Unicode spaces./sanitize 移除所有空白字符，包括不可见的 Unicode 空格。
func sanitize(s string) string {
	s = strings.TrimSpace(s)
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, s)
}

// Hash generates a bcrypt hash at the provided cost./Hash 按指定成本生成 bcrypt 哈希。
func Hash(plain string, cost int) (string, error) {
	if cost <= 0 {
		cost = bcrypt.DefaultCost
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

// Compare verifies a plaintext password against an existing hash./Compare 将明文密码与现有哈希进行校验。
func Compare(hashed, plain string) error {
	cleanHash := sanitize(hashed)
	cleanPlain := sanitize(plain)
	return bcrypt.CompareHashAndPassword([]byte(cleanHash), []byte(cleanPlain))
}
