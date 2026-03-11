package com.myvibereader.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    @GetMapping
    public ResponseEntity<String> sync() {
        return ResponseEntity.ok("Hello World");
    }
}
