// Package logging centralises logger configuration./logging 包集中管理日志配置。
package logging

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"strings"
	"time"
)

// customHandler implements slog.Handler with unified format./customHandler 实现统一格式的 slog.Handler。
type customHandler struct {
	slog.Handler
	service string
}

func (h *customHandler) Handle(ctx context.Context, r slog.Record) error {
	// Format: <timestamp> [<level>] <service> <component> <message>
	// 格式：<timestamp> [<level>] <service> <component> <message>
	timestamp := r.Time.UTC().Format(time.RFC3339Nano)
	level := r.Level.String()
	
	// Extract component from source if available
	// 如果可用，从 source 提取组件
	component := ""
	if r.PC != 0 {
		pc := []uintptr{r.PC}
		fs := runtime.CallersFrames(pc)
		if f, more := fs.Next(); more || f.Function != "" {
			// Extract package/component name
			// 提取包/组件名称
			parts := strings.Split(f.Function, ".")
			if len(parts) > 1 {
				component = strings.Join(parts[:len(parts)-1], ".")
			}
		}
	}
	
	// Build message with attributes
	// 构建包含属性的消息
	msg := r.Message
	if r.NumAttrs() > 0 {
		var attrs []string
		r.Attrs(func(a slog.Attr) bool {
			attrs = append(attrs, fmt.Sprintf("%s=%v", a.Key, a.Value))
			return true
		})
		if len(attrs) > 0 {
			msg += " " + strings.Join(attrs, " ")
		}
	}
	
	// Format output
	// 格式化输出
	output := fmt.Sprintf("%s [%s] %s %s %s\n",
		timestamp,
		strings.ToUpper(level),
		h.service,
		component,
		msg,
	)
	
	_, err := os.Stdout.WriteString(output)
	return err
}

// Setup configures the global slog logger according to the provided level./Setup 根据指定级别配置全局 slog 日志器。
func Setup(level string) *slog.Logger {
	baseHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(level)})
	handler := &customHandler{
		Handler: baseHandler,
		service: "site-auth",
	}
	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

// parseLevel normalises level strings to slog levels./parseLevel 将级别字符串归一化为 slog 级别。
func parseLevel(level string) slog.Leveler {
        switch strings.ToUpper(strings.TrimSpace(level)) {
        case "DEBUG":
                return slog.LevelDebug
	case "INFO", "":
		return slog.LevelInfo
	case "WARN", "WARNING":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
