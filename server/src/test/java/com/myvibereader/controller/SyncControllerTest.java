package com.myvibereader.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import com.myvibereader.config.SecurityConfig;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SyncController.class)
@Import(SecurityConfig.class)
class SyncControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser
    void sync_returnsHelloWorld() throws Exception {
        mockMvc.perform(get("/api/sync"))
                .andExpect(status().isOk())
                .andExpect(content().string("Hello World"));
    }

    @Test
    void sync_withoutAuth_returnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/sync"))
                .andExpect(status().isForbidden());
    }
}
