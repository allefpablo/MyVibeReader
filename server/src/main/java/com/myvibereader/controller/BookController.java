package com.myvibereader.controller;

import com.myvibereader.dto.BookDownload;
import com.myvibereader.dto.BookDto;
import com.myvibereader.service.BookService;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    @GetMapping
    public ResponseEntity<List<BookDto>> listBooks(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(bookService.listBooks(userId));
    }

    @PostMapping("/upload")
    public ResponseEntity<BookDto> uploadBook(
            @AuthenticationPrincipal String userId,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(bookService.uploadBook(userId, file));
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadBook(
            @AuthenticationPrincipal String userId,
            @PathVariable String id) {
        BookDownload download = bookService.downloadBook(userId, id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + download.filename() + "\"")
                .contentType(MediaType.parseMediaType(download.contentType()))
                .contentLength(download.contentLength())
                .body(new InputStreamResource(download.inputStream()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteBook(
            @AuthenticationPrincipal String userId,
            @PathVariable String id) {
        bookService.deleteBook(userId, id);
        return ResponseEntity.noContent().build();
    }
}
