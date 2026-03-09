package com.myvibereader.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "books")
public class Book {

    public enum Format { PDF, EPUB }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String title;

    private String author;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Format format;

    @Column(nullable = false)
    private String storagePath;

    @Column(nullable = false, updatable = false)
    private Instant uploadedAt = Instant.now();

    public String getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }
    public Format getFormat() { return format; }
    public void setFormat(Format format) { this.format = format; }
    public String getStoragePath() { return storagePath; }
    public void setStoragePath(String storagePath) { this.storagePath = storagePath; }
    public Instant getUploadedAt() { return uploadedAt; }
}
