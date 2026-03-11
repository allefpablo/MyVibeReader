package com.myvibereader.service;

import com.myvibereader.config.JwtUtil;
import com.myvibereader.dto.AuthRequest;
import com.myvibereader.dto.AuthResponse;
import com.myvibereader.model.User;
import com.myvibereader.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtUtil jwtUtil;

    @InjectMocks AuthService authService;

    @Test
    void register_newEmail_savesUserAndReturnsToken() {
        when(userRepository.existsByEmail("user@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password1")).thenReturn("hashed");
        User savedUser = mockUser("uuid-1", "user@example.com");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);
        when(jwtUtil.generateToken("uuid-1")).thenReturn("token-abc");

        AuthResponse response = authService.register(new AuthRequest("user@example.com", "password1"));

        assertThat(response.token()).isEqualTo("token-abc");
        assertThat(response.email()).isEqualTo("user@example.com");
        assertThat(response.userId()).isEqualTo("uuid-1");
        verify(userRepository).save(any(User.class));
    }

    @Test
    void register_duplicateEmail_throwsConflict() {
        when(userRepository.existsByEmail("user@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(new AuthRequest("user@example.com", "password1")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void login_validCredentials_returnsToken() {
        User user = mockUser("uuid-1", "user@example.com");
        when(user.getPasswordHash()).thenReturn("hashed");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password1", "hashed")).thenReturn(true);
        when(jwtUtil.generateToken("uuid-1")).thenReturn("token-abc");

        AuthResponse response = authService.login(new AuthRequest("user@example.com", "password1"));

        assertThat(response.token()).isEqualTo("token-abc");
    }

    @Test
    void login_unknownEmail_throwsUnauthorized() {
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new AuthRequest("unknown@example.com", "password1")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void login_wrongPassword_throwsUnauthorized() {
        User user = mock(User.class);
        when(user.getPasswordHash()).thenReturn("hashed");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrongpass", "hashed")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(new AuthRequest("user@example.com", "wrongpass")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    private User mockUser(String id, String email) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getEmail()).thenReturn(email);
        return user;
    }
}
