package com.myvibereader.service;

import com.myvibereader.dto.BookDto;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@Service
public class BookService {

    public List<BookDto> listBooks(String userId) {
        throw new UnsupportedOperationException("TODO");
    }

    public BookDto uploadBook(String userId, MultipartFile file) {
        throw new UnsupportedOperationException("TODO");
    }

    public byte[] downloadBook(String userId, String bookId) {
        throw new UnsupportedOperationException("TODO");
    }

    public void deleteBook(String userId, String bookId) {
        throw new UnsupportedOperationException("TODO");
    }
}
