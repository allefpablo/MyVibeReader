package com.myvibereader.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper;

    public ProgressService(ReadingProgressRepository readingProgressRepository,
                           BookRepository bookRepository,
                           UserRepository userRepository,
                           ObjectMapper objectMapper) {
        this.readingProgressRepository = readingProgressRepository;
        this.bookRepository = bookRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    public ProgressDto getProgress(String userId, String bookId) {
        ReadingProgress progress = readingProgressRepository.findByUserIdAndBookId(userId, bookId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Progress not found"));
        return toDto(progress);
    }

    public ProgressDto upsertProgress(String userId, String bookId, ProgressDto dto) {
        Book book = bookRepository.findByIdAndUserId(bookId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Book not found"));

        validatePositionJson(dto.positionJson(), book.getFormat());

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

    private void validatePositionJson(String positionJson, Book.Format format) {
        if (positionJson == null || positionJson.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "positionJson must not be blank");
        }
        if (positionJson.length() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "positionJson must not exceed 2000 characters");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(positionJson);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "positionJson is not valid JSON");
        }

        if (root == null || !root.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "positionJson must be a JSON object");
        }

        if (format == Book.Format.PDF) {
            JsonNode pageNode = root.get("page");
            if (pageNode == null || !pageNode.canConvertToInt() || pageNode.asInt() < 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PDF positionJson must contain integer 'page' >= 1");
            }
            if (root.has("scrollY")) {
                JsonNode scrollYNode = root.get("scrollY");
                if (!scrollYNode.isNumber() || scrollYNode.asDouble() < 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PDF scrollY must be a non-negative number");
                }
            }
        } else if (format == Book.Format.EPUB) {
            JsonNode cfiNode = root.get("cfi");
            if (cfiNode == null || !cfiNode.isTextual() || cfiNode.asText().trim().isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EPUB positionJson must contain non-blank string 'cfi'");
            }
        }
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
