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

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

@Service
public class ProgressService {

    private static final Duration MAX_FUTURE_SKEW = Duration.ofMinutes(5);

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

        Instant now = Instant.now();
        Instant incomingTimestamp = dto.updatedAt() != null ? dto.updatedAt() : now;

        if (incomingTimestamp.isAfter(now.plus(MAX_FUTURE_SKEW))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Timestamp cannot be in the future");
        }

        Optional<ReadingProgress> existingOpt = readingProgressRepository.findByUserIdAndBookId(userId, bookId);
        if (existingOpt.isPresent()) {
            ReadingProgress existing = existingOpt.get();
            if (existing.getUpdatedAt() != null && incomingTimestamp.isBefore(existing.getUpdatedAt())) {
                return toDto(existing);
            }

            existing.setPositionJson(dto.positionJson());
            existing.setDeviceId(dto.deviceId());
            existing.setUpdatedAt(incomingTimestamp);
            return toDto(readingProgressRepository.save(existing));
        }

        ReadingProgress progress = new ReadingProgress();
        progress.setUser(userRepository.getReferenceById(userId));
        progress.setBook(book);
        progress.setPositionJson(dto.positionJson());
        progress.setDeviceId(dto.deviceId());
        progress.setUpdatedAt(incomingTimestamp);

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
