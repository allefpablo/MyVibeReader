package com.myvibereader.dto;

import java.time.Instant;

public record ProgressDto(
    String bookId,
    String positionJson,
    String deviceId,
    Instant updatedAt
) {}
