package com.myvibereader.controller;

import com.myvibereader.config.JwtAuthFilter;
import com.myvibereader.config.JwtUtil;
import com.myvibereader.config.SecurityConfig;
import com.myvibereader.dto.BookDto;
import com.myvibereader.service.BookService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BookController.class)
@Import({SecurityConfig.class, JwtAuthFilter.class, JwtUtil.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-secret-key-for-unit-tests-that-is-long-enough-256-bits",
        "app.jwt.expiration-ms=86400000"
})
class BookControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtUtil jwtUtil;
    @MockitoBean BookService bookService;

    private static final BookDto SAMPLE_BOOK = new BookDto(
            "book-1", "My Book", null, "PDF", Instant.parse("2024-01-01T00:00:00Z"));

    @Test
    void uploadBook_validPdf_returns201() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        MockMultipartFile file = new MockMultipartFile(
                "file", "my-book.pdf", "application/pdf", "content".getBytes());
        when(bookService.uploadBook(eq("user-123"), any())).thenReturn(SAMPLE_BOOK);

        mockMvc.perform(multipart("/api/books/upload").file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("book-1"))
                .andExpect(jsonPath("$.title").value("My Book"))
                .andExpect(jsonPath("$.format").value("PDF"));
    }

    @Test
    void uploadBook_unsupportedFormat_returns415() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        MockMultipartFile file = new MockMultipartFile(
                "file", "doc.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "content".getBytes());
        when(bookService.uploadBook(any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE));

        mockMvc.perform(multipart("/api/books/upload").file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void uploadBook_noAuth_returns403() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "my-book.pdf", "application/pdf", "content".getBytes());

        mockMvc.perform(multipart("/api/books/upload").file(file))
                .andExpect(status().isForbidden());
    }

    @Test
    void listBooks_authenticatedUser_returnsBooks() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        when(bookService.listBooks("user-123")).thenReturn(List.of(SAMPLE_BOOK));

        mockMvc.perform(get("/api/books")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("book-1"))
                .andExpect(jsonPath("$[0].title").value("My Book"));
    }

    @Test
    void listBooks_noAuth_returns403() throws Exception {
        mockMvc.perform(get("/api/books"))
                .andExpect(status().isForbidden());
    }

    @Test
    void downloadBook_authenticatedUser_returns200() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        when(bookService.downloadBook("user-123", "book-1")).thenReturn("sample bytes".getBytes());

        mockMvc.perform(get("/api/books/book-1/download")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"book-book-1\""))
                .andExpect(content().bytes("sample bytes".getBytes()));
    }

    @Test
    void deleteBook_authenticatedUser_returns204() throws Exception {
        String token = jwtUtil.generateToken("user-123");
        doNothing().when(bookService).deleteBook("user-123", "book-1");

        mockMvc.perform(delete("/api/books/book-1")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
    }
}
