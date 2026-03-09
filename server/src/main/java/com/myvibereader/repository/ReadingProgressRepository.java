package com.myvibereader.repository;

import com.myvibereader.model.ReadingProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ReadingProgressRepository extends JpaRepository<ReadingProgress, String> {
    Optional<ReadingProgress> findByUserIdAndBookId(String userId, String bookId);
}
