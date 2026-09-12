package com.myvibereader.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record ProgressDto(
    String bookId,
    @NotBlank(message = "positionJson is required")
    @Size(max = 2000, message = "positionJson must not exceed 2000 characters")
    String positionJson,
    @Size(max = 100, message = "deviceId must not exceed 100 characters")
    String deviceId,
    Instant updatedAt
) {}
