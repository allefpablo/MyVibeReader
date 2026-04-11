package com.myvibereader.service;

import com.myvibereader.dto.BookDto;
import com.myvibereader.model.Book;
import com.myvibereader.repository.BookRepository;
import com.myvibereader.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BookServiceTest {

    @Mock BookRepository bookRepository;
    @Mock UserRepository userRepository;
    @Mock S3Client s3Client;

    @InjectMocks BookService bookService;

    private static final String BUCKET = "test-bucket";
    private static final String USER_ID = "user-123";

    @Test
    void uploadBook_validPdf_savesBookAndUploadsToS3() throws Exception {
        bookService.setBucketName(BUCKET);

        MockMultipartFile file = new MockMultipartFile(
                "file", "my-book.pdf", "application/pdf", "pdf-content".getBytes());

        Book saved = mockBook("book-1", "my-book", Book.Format.PDF, "user-123/book-1.pdf");
        when(bookRepository.save(any(Book.class))).thenReturn(saved);

        BookDto result = bookService.uploadBook(USER_ID, file);

        assertThat(result.title()).isEqualTo("my-book");
        assertThat(result.format()).isEqualTo("PDF");

        ArgumentCaptor<PutObjectRequest> putCaptor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(putCaptor.capture(), any(RequestBody.class));
        assertThat(putCaptor.getValue().bucket()).isEqualTo(BUCKET);
        assertThat(putCaptor.getValue().key()).matches(USER_ID + "/[a-f0-9\\-]+\\.pdf");
        assertThat(putCaptor.getValue().contentType()).isEqualTo("application/pdf");
    }

    @Test
    void uploadBook_validEpub_savesBookAndUploadsToS3() throws Exception {
        bookService.setBucketName(BUCKET);

        MockMultipartFile file = new MockMultipartFile(
                "file", "great-novel.epub", "application/epub+zip", "epub-content".getBytes());

        Book saved = mockBook("book-2", "great-novel", Book.Format.EPUB, "user-123/book-2.epub");
        when(bookRepository.save(any(Book.class))).thenReturn(saved);

        BookDto result = bookService.uploadBook(USER_ID, file);

        assertThat(result.format()).isEqualTo("EPUB");
        verify(s3Client).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    void uploadBook_unsupportedFormat_throws415() {
        bookService.setBucketName(BUCKET);

        MockMultipartFile file = new MockMultipartFile(
                "file", "document.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "content".getBytes());

        assertThatThrownBy(() -> bookService.uploadBook(USER_ID, file))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);

        verifyNoInteractions(s3Client);
        verifyNoInteractions(bookRepository);
    }

    @Test
    void uploadBook_emptyFile_throws400() {
        bookService.setBucketName(BUCKET);

        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.pdf", "application/pdf", new byte[0]);

        assertThatThrownBy(() -> bookService.uploadBook(USER_ID, file))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void listBooks_returnsAllBooksForUser() {
        Book b1 = mockBook("b1", "Book One", Book.Format.PDF, "user-123/b1.pdf");
        Book b2 = mockBook("b2", "Book Two", Book.Format.EPUB, "user-123/b2.epub");
        when(bookRepository.findByUserId(USER_ID)).thenReturn(List.of(b1, b2));

        List<BookDto> result = bookService.listBooks(USER_ID);

        assertThat(result).hasSize(2);
        assertThat(result).extracting(BookDto::title).containsExactly("Book One", "Book Two");
    }

    @Test
    void listBooks_noBooks_returnsEmptyList() {
        when(bookRepository.findByUserId(USER_ID)).thenReturn(List.of());

        assertThat(bookService.listBooks(USER_ID)).isEmpty();
    }

    private Book mockBook(String id, String title, Book.Format format, String storagePath) {
        Book book = mock(Book.class);
        when(book.getId()).thenReturn(id);
        when(book.getTitle()).thenReturn(title);
        when(book.getFormat()).thenReturn(format);
        when(book.getUploadedAt()).thenReturn(Instant.now());
        return book;
    }
}
