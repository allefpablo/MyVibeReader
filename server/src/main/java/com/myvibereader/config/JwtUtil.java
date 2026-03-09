package com.myvibereader.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtUtil {

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiration-ms}")
    private long expirationMs;

    public String generateToken(String userId) {
        throw new UnsupportedOperationException("TODO");
    }

    public String extractUserId(String token) {
        throw new UnsupportedOperationException("TODO");
    }

    public boolean isTokenValid(String token) {
        throw new UnsupportedOperationException("TODO");
    }
}
