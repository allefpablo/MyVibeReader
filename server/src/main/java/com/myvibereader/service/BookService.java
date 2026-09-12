package com.myvibereader.service;

import com.myvibereader.dto.BookDownload;
import com.myvibereader.dto.BookDto;
import com.myvibereader.model.Book;
import com.myvibereader.repository.BookRepository;
import com.myvibereader.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class BookService {

    public static final long MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024L; // 30 MB
    private static final int MAX_TITLE_LENGTH = 255;
    private static final String DEFAULT_TITLE = "Untitled";
    private static final Pattern DISALLOWED_CHARS = Pattern.compile("[\\p{Cntrl}\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]");

    private static final byte[] PDF_MAGIC = new byte[]{0x25, 0x50, 0x44, 0x46, 0x2D}; // %PDF-
    private static final byte[] ZIP_MAGIC = new byte[]{0x50, 0x4B, 0x03, 0x04};       // PK\x03\x04

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

        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File size exceeds the 30MB limit");
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
        String title = sanitizeTitle(file.getOriginalFilename());

        try (InputStream is = new BufferedInputStream(file.getInputStream())) {
            is.mark(16);
            byte[] header = new byte[16];
            int bytesRead = is.read(header);
            is.reset();

            validateFileSignature(format, header, bytesRead);

            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucketName)
                            .key(s3Key)
                            .contentType(contentType)
                            .contentLength(file.getSize())
                            .build(),
                    RequestBody.fromInputStream(is, file.getSize()));
        } catch (ResponseStatusException e) {
            throw e;
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

    public BookDownload downloadBook(String userId, String bookId) {
        Book book = bookRepository.findByIdAndUserId(bookId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Book not found"));

        try {
            ResponseInputStream<GetObjectResponse> stream = s3Client.getObject(
                    GetObjectRequest.builder()
                            .bucket(bucketName)
                            .key(book.getStoragePath())
                            .build()
            );

            String ext = FORMAT_EXTENSION.get(book.getFormat());
            String filename = "book-" + book.getId() + (ext != null ? "." + ext : "");
            String contentType = stream.response().contentType();
            if (contentType == null || contentType.isBlank()) {
                contentType = book.getFormat() == Book.Format.PDF ? "application/pdf" : "application/epub+zip";
            }
            long contentLength = stream.response().contentLength() != null ? stream.response().contentLength() : 0L;

            return new BookDownload(stream, contentType, contentLength, filename);
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

    String sanitizeTitle(String filename) {
        if (filename == null || filename.isBlank()) {
            return DEFAULT_TITLE;
        }

        // 1. Extract basename: normalize backslashes to forward slashes and take the last segment
        String basename = filename.replace('\\', '/');
        int lastSlash = basename.lastIndexOf('/');
        if (lastSlash >= 0) {
            basename = basename.substring(lastSlash + 1);
        }

        // 2. Strip extension
        int lastDot = basename.lastIndexOf('.');
        if (lastDot > 0) {
            basename = basename.substring(0, lastDot);
        } else if (lastDot == 0) {
            basename = "";
        }

        // 3. Remove control chars and bidirectional override/formatting characters
        basename = DISALLOWED_CHARS.matcher(basename).replaceAll(" ");

        // 4. Normalize whitespace (collapse multiple spaces, trim)
        basename = basename.trim().replaceAll("\\s+", " ");

        // 5. Truncate to MAX_TITLE_LENGTH
        if (basename.length() > MAX_TITLE_LENGTH) {
            basename = basename.substring(0, MAX_TITLE_LENGTH).trim();
        }

        return basename.isBlank() ? DEFAULT_TITLE : basename;
    }

    private void validateFileSignature(Book.Format format, byte[] header, int bytesRead) {
        if (bytesRead < 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is too small to be a valid " + format);
        }
        if (format == Book.Format.PDF) {
            if (bytesRead < 5 || !startsWith(header, PDF_MAGIC)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid PDF file signature");
            }
        } else if (format == Book.Format.EPUB) {
            if (!startsWith(header, ZIP_MAGIC)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid EPUB file signature");
            }
        }
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        if (data == null || data.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }
}
