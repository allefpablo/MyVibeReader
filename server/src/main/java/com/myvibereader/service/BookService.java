package com.myvibereader.service;

import com.myvibereader.dto.BookDto;
import com.myvibereader.model.Book;
import com.myvibereader.repository.BookRepository;
import com.myvibereader.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class BookService {

    private static final Map<String, Book.Format> ALLOWED_TYPES = Map.of(
            "application/pdf", Book.Format.PDF,
            "application/epub+zip", Book.Format.EPUB
    );

    private static final Map<Book.Format, String> FORMAT_EXTENSION = Map.of(
            Book.Format.PDF, "pdf",
            Book.Format.EPUB, "epub"
    );

    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final S3Client s3Client;

    @Value("${app.s3.bucket}")
    private String bucketName;

    public BookService(BookRepository bookRepository, UserRepository userRepository, S3Client s3Client) {
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
        this.s3Client = s3Client;
    }

    // Used only in unit tests to inject bucket name without Spring context
    void setBucketName(String bucketName) {
        this.bucketName = bucketName;
    }

    public List<BookDto> listBooks(String userId) {
        return bookRepository.findByUserId(userId).stream()
                .map(this::toDto)
                .toList();
    }

    public BookDto uploadBook(String userId, MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File must not be empty");
        }

        String contentType = file.getContentType();
        Book.Format format = ALLOWED_TYPES.get(contentType);
        if (format == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported format. Only PDF and EPUB are accepted");
        }

        String s3KeyId = UUID.randomUUID().toString();
        String ext = FORMAT_EXTENSION.get(format);
        String s3Key = userId + "/" + s3KeyId + "." + ext;
        String title = stripExtension(file.getOriginalFilename());

        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucketName)
                            .key(s3Key)
                            .contentType(contentType)
                            .contentLength(file.getSize())
                            .build(),
                    RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read uploaded file");
        }

        Book book = new Book();
        book.setUser(userRepository.getReferenceById(userId));
        book.setTitle(title);
        book.setFormat(format);
        book.setStoragePath(s3Key);

        return toDto(bookRepository.save(book));
    }

    public byte[] downloadBook(String userId, String bookId) {
        Book book = bookRepository.findByIdAndUserId(bookId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Book not found"));

        try {
            ResponseBytes<GetObjectResponse> objectBytes = s3Client.getObjectAsBytes(
                    GetObjectRequest.builder()
                            .bucket(bucketName)
                            .key(book.getStoragePath())
                            .build()
            );
            return objectBytes.asByteArray();
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to download file from storage");
        }
    }

    public void deleteBook(String userId, String bookId) {
        Book book = bookRepository.findByIdAndUserId(bookId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Book not found"));

        try {
            s3Client.deleteObject(
                    DeleteObjectRequest.builder()
                            .bucket(bucketName)
                            .key(book.getStoragePath())
                            .build()
            );
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to delete file from storage");
        }

        bookRepository.delete(book);
    }

    private BookDto toDto(Book book) {
        return new BookDto(
                book.getId(),
                book.getTitle(),
                book.getAuthor(),
                book.getFormat().name(),
                book.getUploadedAt()
        );
    }

    private String stripExtension(String filename) {
        if (filename == null || filename.isBlank()) return "Unknown";
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }
}
