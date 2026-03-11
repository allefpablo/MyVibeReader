package com.myvibereader.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class JwtUtilTest {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret",
                "test-secret-key-for-unit-tests-that-is-long-enough-256-bits");
        ReflectionTestUtils.setField(jwtUtil, "expirationMs", 86400000L);
    }

    @Test
    void generateToken_returnsNonNullString() {
        String token = jwtUtil.generateToken("user-123");
        assertThat(token).isNotBlank();
    }

    @Test
    void extractUserId_returnsOriginalUserId() {
        String token = jwtUtil.generateToken("user-123");
        assertThat(jwtUtil.extractUserId(token)).isEqualTo("user-123");
    }

    @Test
    void isTokenValid_trueForFreshToken() {
        String token = jwtUtil.generateToken("user-123");
        assertThat(jwtUtil.isTokenValid(token)).isTrue();
    }

    @Test
    void isTokenValid_falseForTamperedToken() {
        String token = jwtUtil.generateToken("user-123");
        String tampered = token.substring(0, token.length() - 4) + "xxxx";
        assertThat(jwtUtil.isTokenValid(tampered)).isFalse();
    }

    @Test
    void isTokenValid_falseForExpiredToken() {
        ReflectionTestUtils.setField(jwtUtil, "expirationMs", -1000L);
        String token = jwtUtil.generateToken("user-123");
        assertThat(jwtUtil.isTokenValid(token)).isFalse();
    }
}
