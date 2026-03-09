package com.myvibereader.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "reading_progress",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "book_id"}))
public class ReadingProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "book_id", nullable = false)
    private Book book;

    /**
     * JSON string storing position. For EPUB: CFI string. For PDF: page number.
     * Example EPUB: {"cfi": "epubcfi(/6/4[chap01]!/4/2/2[intro]/1:0)"}
     * Example PDF:  {"page": 42, "scrollY": 320}
     */
    @Column(columnDefinition = "TEXT", nullable = false)
    private String positionJson;

    private String deviceId;

    @Column(nullable = false)
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Book getBook() { return book; }
    public void setBook(Book book) { this.book = book; }
    public String getPositionJson() { return positionJson; }
    public void setPositionJson(String positionJson) { this.positionJson = positionJson; }
    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
