package com.myvibereader.service;

import com.myvibereader.dto.ProgressDto;
import com.myvibereader.model.Book;
import com.myvibereader.model.ReadingProgress;
import com.myvibereader.repository.BookRepository;
import com.myvibereader.repository.ReadingProgressRepository;
import com.myvibereader.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

@Service
public class ProgressService {

    private final ReadingProgressRepository readingProgressRepository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;

    public ProgressService(ReadingProgressRepository readingProgressRepository,
                           BookRepository bookRepository,
                           UserRepository userRepository) {
        this.readingProgressRepository = readingProgressRepository;
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
    }

    public ProgressDto getProgress(String userId, String bookId) {
        ReadingProgress progress = readingProgressRepository.findByUserIdAndBookId(userId, bookId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Progress not found"));
        return toDto(progress);
    }

    public ProgressDto upsertProgress(String userId, String bookId, ProgressDto dto) {
        Book book = bookRepository.findByIdAndUserId(bookId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Book not found"));

        ReadingProgress progress = readingProgressRepository.findByUserIdAndBookId(userId, bookId)
                .orElseGet(() -> {
                    ReadingProgress rp = new ReadingProgress();
                    rp.setUser(userRepository.getReferenceById(userId));
                    rp.setBook(book);
                    return rp;
                });

        progress.setPositionJson(dto.positionJson());
        progress.setDeviceId(dto.deviceId());
        progress.setUpdatedAt(dto.updatedAt() != null ? dto.updatedAt() : Instant.now());

        return toDto(readingProgressRepository.save(progress));
    }

    private ProgressDto toDto(ReadingProgress progress) {
        return new ProgressDto(
                progress.getBook().getId(),
                progress.getPositionJson(),
                progress.getDeviceId(),
                progress.getUpdatedAt()
        );
    }
}
