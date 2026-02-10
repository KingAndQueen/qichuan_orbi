// Package jwt provides JWT token issuance and validation using RS256./jwt 包提供使用 RS256 的 JWT 令牌签发和验证。
package jwt

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"log/slog"
)

var (
	// ErrInvalidKey indicates the private key is invalid./ErrInvalidKey 表示私钥无效。
	ErrInvalidKey = errors.New("invalid private key")
	// ErrKeyNotFound indicates the key file is missing./ErrKeyNotFound 表示密钥文件缺失。
	ErrKeyNotFound = errors.New("key file not found")
)

// Issuer handles JWT token issuance./Issuer 处理 JWT 令牌签发。
type Issuer struct {
	privateKey *rsa.PrivateKey
	issuer     string
}

// Claims represents JWT token claims./Claims 表示 JWT 令牌声明。
type Claims struct {
	UserID   string `json:"user_id"`  // Custom claim for convenience./自定义声明（便于使用）。
	Username string `json:"username"` // Custom claim for convenience./自定义声明（便于使用）。
	jwt.RegisteredClaims
}

// NewIssuer creates a new JWT issuer from a private key file./NewIssuer 从私钥文件创建新的 JWT 签发器。
func NewIssuer(privateKeyPath, issuer string) (*Issuer, error) {
	if privateKeyPath == "" {
		return nil, ErrKeyNotFound
	}

	keyData, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("read private key: %w", err)
	}

	block, _ := pem.Decode(keyData)
	if block == nil {
		return nil, fmt.Errorf("%w: failed to decode PEM block", ErrInvalidKey)
	}

	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		// Try PKCS8 format/尝试 PKCS8 格式
		key, err2 := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("%w: %v (also tried PKCS8: %v)", ErrInvalidKey, err, err2)
		}
		var ok bool
		privateKey, ok = key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("%w: key is not RSA private key", ErrInvalidKey)
		}
	}

	return &Issuer{
		privateKey: privateKey,
		issuer:     issuer,
	}, nil
}

// IssueToken creates a new JWT token for the given user./IssueToken 为指定用户创建新的 JWT 令牌。
func (i *Issuer) IssueToken(userID, username string, ttl time.Duration) (string, error) {
	now := time.Now()
	jti := uuid.NewString()

	claims := Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    i.issuer,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			ID:        jti, // jti is used for logout blacklist./jti 用于退出登录黑名单。
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenString, err := token.SignedString(i.privateKey)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}

	return tokenString, nil
}

// GetJTI extracts the JTI (JWT ID) from a token string without full validation./GetJTI 从令牌字符串中提取 JTI（JWT ID），无需完整验证。
// This is useful for logout operations where we only need the JTI./这对于只需要 JTI 的退出登录操作很有用。
func GetJTI(tokenString string) (string, error) {
	parser := jwt.NewParser()
	token, _, err := parser.ParseUnverified(tokenString, &Claims{})
	if err != nil {
		return "", fmt.Errorf("parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return "", errors.New("invalid claims type")
	}

	return claims.ID, nil
}

// Validator handles JWT token validation using a public key./Validator 使用公钥处理 JWT 令牌验证。
type Validator struct {
	publicKey *rsa.PublicKey
}

// NewValidator creates a new JWT validator from a public key file./NewValidator 从公钥文件创建新的 JWT 验证器。
func NewValidator(publicKeyPath string) (*Validator, error) {
	if publicKeyPath == "" {
		return nil, ErrKeyNotFound
	}

	keyData, err := os.ReadFile(publicKeyPath)
	if err != nil {
		return nil, fmt.Errorf("read public key: %w", err)
	}

	block, _ := pem.Decode(keyData)
	if block == nil {
		return nil, fmt.Errorf("%w: failed to decode PEM block", ErrInvalidKey)
	}

	publicKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		// Try PKCS1 format/尝试 PKCS1 格式
		publicKey, err = x509.ParsePKCS1PublicKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("%w: failed to parse public key: %v", ErrInvalidKey, err)
		}
	}

	rsaPublicKey, ok := publicKey.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("%w: key is not RSA public key", ErrInvalidKey)
	}

	return &Validator{
		publicKey: rsaPublicKey,
	}, nil
}

// ValidateToken validates a JWT token and returns the claims if valid./ValidateToken 验证 JWT 令牌，如果有效则返回声明。
func (v *Validator) ValidateToken(tokenString string) (*Claims, error) {
	parser := jwt.NewParser()
	token, err := parser.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method/验证签名方法
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return v.publicKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	slog.Default().Debug("JWT 验证通过", "user_id", claims.UserID, "session_id", claims.ID)

	return claims, nil
}
