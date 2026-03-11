package com.myvibereader.controller;

import com.myvibereader.config.JwtAuthFilter;
import com.myvibereader.config.JwtUtil;
import com.myvibereader.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SyncController.class)
@Import({SecurityConfig.class, JwtAuthFilter.class, JwtUtil.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-key-for-unit-tests-that-is-long-enough-256-bits",
        "app.jwt.expiration-ms=86400000"
})
class SyncControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtUtil jwtUtil;

    @Test
    @WithMockUser
    void sync_returnsHelloWorld() throws Exception {
        mockMvc.perform(get("/api/sync"))
                .andExpect(status().isOk())
                .andExpect(content().string("Hello World"));
    }

    @Test
    void sync_withValidJwt_returns200() throws Exception {
        String token = jwtUtil.generateToken("user-123");

        mockMvc.perform(get("/api/sync")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().string("Hello World"));
    }

    @Test
    void sync_withoutAuth_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/sync"))
                .andExpect(status().isForbidden());
    }

    @Test
    void sync_withInvalidJwt_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/sync")
                        .header("Authorization", "Bearer invalid.token.here"))
                .andExpect(status().isForbidden());
    }
}
