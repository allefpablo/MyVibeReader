package com.myvibereader.controller;

import com.myvibereader.config.JwtAuthFilter;
import com.myvibereader.config.JwtUtil;
import com.myvibereader.config.SecurityConfig;
import com.myvibereader.dto.ProgressDto;
import com.myvibereader.service.ProgressService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProgressController.class)
@Import({SecurityConfig.class, JwtAuthFilter.class, JwtUtil.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-key-for-unit-tests-that-is-long-enough-256-bits",
        "app.jwt.expiration-ms=86400000"
})
class ProgressControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtUtil jwtUtil;
    @MockitoBean ProgressService progressService;

    private static final ProgressDto SAMPLE_PROGRESS = new ProgressDto(
            "book-123", "{\"page\": 42}", "dev-1", Instant.parse("2024-01-01T00:00:00Z"));

    @Test
    void getProgress_authenticated_returns200() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        when(progressService.getProgress("user-123", "book-123")).thenReturn(SAMPLE_PROGRESS);

        mockMvc.perform(get("/api/progress/book-123")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookId").value("book-123"))
                .andExpect(jsonPath("$.positionJson").value("{\"page\": 42}"))
                .andExpect(jsonPath("$.deviceId").value("dev-1"));
    }

    @Test
    void getProgress_unauthenticated_returns403() throws Exception {
        mockMvc.perform(get("/api/progress/book-123"))
                .andExpect(status().isForbidden());
    }

    @Test
    void getProgress_notFound_returns404() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        when(progressService.getProgress("user-123", "book-123"))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Progress not found"));

        mockMvc.perform(get("/api/progress/book-123")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void updateProgress_authenticated_returns200() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        when(progressService.upsertProgress(eq("user-123"), eq("book-123"), any())).thenReturn(SAMPLE_PROGRESS);

        mockMvc.perform(put("/api/progress/book-123")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"book-123\",\"positionJson\":\"{\\\"page\\\": 42}\",\"deviceId\":\"dev-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookId").value("book-123"))
                .andExpect(jsonPath("$.positionJson").value("{\"page\": 42}"));
    }
}
