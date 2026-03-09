package com.myvibereader.controller;

import com.myvibereader.dto.ProgressDto;
import com.myvibereader.service.ProgressService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/progress")
public class ProgressController {

    private final ProgressService progressService;

    public ProgressController(ProgressService progressService) {
        this.progressService = progressService;
    }

    @GetMapping("/{bookId}")
    public ResponseEntity<ProgressDto> getProgress(@PathVariable String bookId) {
        throw new UnsupportedOperationException("TODO");
    }

    @PutMapping("/{bookId}")
    public ResponseEntity<ProgressDto> updateProgress(
            @PathVariable String bookId,
            @RequestBody ProgressDto dto) {
        throw new UnsupportedOperationException("TODO");
    }
}
