package com.myvibereader.controller;

import com.myvibereader.dto.BookDto;
import com.myvibereader.service.BookService;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<List<BookDto>> listBooks() {
        throw new UnsupportedOperationException("TODO");
    }

    @PostMapping("/upload")
    public ResponseEntity<BookDto> uploadBook(@RequestParam("file") MultipartFile file) {
        throw new UnsupportedOperationException("TODO");
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> downloadBook(@PathVariable String id) {
        throw new UnsupportedOperationException("TODO");
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteBook(@PathVariable String id) {
        throw new UnsupportedOperationException("TODO");
    }
}
