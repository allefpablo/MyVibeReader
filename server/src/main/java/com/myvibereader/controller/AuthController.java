package com.myvibereader.controller;

import com.myvibereader.dto.AuthRequest;
import com.myvibereader.dto.AuthResponse;
import com.myvibereader.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody AuthRequest request) {
        throw new UnsupportedOperationException("TODO");
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequest request) {
        throw new UnsupportedOperationException("TODO");
    }
}
