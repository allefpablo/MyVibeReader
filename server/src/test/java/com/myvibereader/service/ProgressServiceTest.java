package com.myvibereader.service;

import com.myvibereader.dto.ProgressDto;
import com.myvibereader.model.Book;
import com.myvibereader.model.ReadingProgress;
import com.myvibereader.model.User;
import com.myvibereader.repository.BookRepository;
import com.myvibereader.repository.ReadingProgressRepository;
import com.myvibereader.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProgressServiceTest {

    @Mock
    private ReadingProgressRepository readingProgressRepository;

    @Mock
    private BookRepository bookRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private ProgressService progressService;

    private String userId;
    private String bookId;
    private Book book;
    private User user;
    private ReadingProgress progress;

    @BeforeEach
    void setUp() {
        userId = "user-123";
        bookId = "book-456";

        user = new User();
        book = new Book();
        book.setId(bookId);
        book.setUser(user);

        progress = new ReadingProgress();
        progress.setUser(user);
        progress.setBook(book);
        progress.setPositionJson("{\"page\": 10}");
        progress.setDeviceId("dev-1");
        progress.setUpdatedAt(Instant.now());
    }

    @Test
    void getProgress_existingProgress_returnsProgressDto() {
        when(readingProgressRepository.findByUserIdAndBookId(userId, bookId)).thenReturn(Optional.of(progress));

        ProgressDto result = progressService.getProgress(userId, bookId);

        assertNotNull(result);
        assertEquals(bookId, result.bookId());
        assertEquals("{\"page\": 10}", result.positionJson());
        assertEquals("dev-1", result.deviceId());
    }

    @Test
    void getProgress_notFound_throws404() {
        when(readingProgressRepository.findByUserIdAndBookId(userId, bookId)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> progressService.getProgress(userId, bookId));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void upsertProgress_newRecord_savesAndReturnsDto() {
        when(bookRepository.findByIdAndUserId(bookId, userId)).thenReturn(Optional.of(book));
        when(readingProgressRepository.findByUserIdAndBookId(userId, bookId)).thenReturn(Optional.empty());
        when(userRepository.getReferenceById(userId)).thenReturn(user);
        when(readingProgressRepository.save(any(ReadingProgress.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProgressDto inputDto = new ProgressDto(bookId, "{\"page\": 20}", "dev-2", Instant.now());
        ProgressDto result = progressService.upsertProgress(userId, bookId, inputDto);

        assertNotNull(result);
        assertEquals(bookId, result.bookId());
        assertEquals("{\"page\": 20}", result.positionJson());
        assertEquals("dev-2", result.deviceId());
        verify(readingProgressRepository).save(any(ReadingProgress.class));
    }

    @Test
    void upsertProgress_existingRecord_updatesAndReturnsDto() {
        when(bookRepository.findByIdAndUserId(bookId, userId)).thenReturn(Optional.of(book));
        when(readingProgressRepository.findByUserIdAndBookId(userId, bookId)).thenReturn(Optional.of(progress));
        when(readingProgressRepository.save(any(ReadingProgress.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProgressDto inputDto = new ProgressDto(bookId, "{\"page\": 30}", "dev-1", Instant.now());
        ProgressDto result = progressService.upsertProgress(userId, bookId, inputDto);

        assertNotNull(result);
        assertEquals("{\"page\": 30}", result.positionJson());
        verify(readingProgressRepository).save(progress);
    }

    @Test
    void upsertProgress_bookNotFound_throws404() {
        when(bookRepository.findByIdAndUserId(bookId, userId)).thenReturn(Optional.empty());

        ProgressDto inputDto = new ProgressDto(bookId, "{\"page\": 5}", "dev-1", Instant.now());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> progressService.upsertProgress(userId, bookId, inputDto));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }
}
