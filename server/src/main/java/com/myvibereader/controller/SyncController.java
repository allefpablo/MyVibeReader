package com.myvibereader.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    @GetMapping
    public ResponseEntity<Map<String, String>> sync() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "MyVibeReader Sync Service",
                "timestamp", Instant.now().toString()
        ));
    }
}
