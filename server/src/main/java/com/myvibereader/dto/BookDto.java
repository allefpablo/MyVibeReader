package com.myvibereader.dto;

import java.time.Instant;

public record BookDto(
    String id,
    String title,
    String author,
    String format,
    Instant uploadedAt
) {}
