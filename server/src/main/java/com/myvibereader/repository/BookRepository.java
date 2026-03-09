package com.myvibereader.repository;

import com.myvibereader.model.Book;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BookRepository extends JpaRepository<Book, String> {
    List<Book> findByUserId(String userId);
    Optional<Book> findByIdAndUserId(String id, String userId);
}
