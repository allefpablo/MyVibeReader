package com.myvibereader.controller;

import com.myvibereader.dto.ProgressDto;
import com.myvibereader.service.ProgressService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/progress")
public class ProgressController {

    private final ProgressService progressService;

    public ProgressController(ProgressService progressService) {
        this.progressService = progressService;
    }

    @GetMapping("/{bookId}")
    public ResponseEntity<ProgressDto> getProgress(
            @AuthenticationPrincipal String userId,
            @PathVariable String bookId) {
        return ResponseEntity.ok(progressService.getProgress(userId, bookId));
    }

    @PutMapping("/{bookId}")
    public ResponseEntity<ProgressDto> updateProgress(
            @AuthenticationPrincipal String userId,
            @PathVariable String bookId,
            @RequestBody ProgressDto dto) {
        return ResponseEntity.ok(progressService.upsertProgress(userId, bookId, dto));
    }
}
