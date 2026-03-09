package com.myvibereader.service;

import com.myvibereader.dto.ProgressDto;
import org.springframework.stereotype.Service;

@Service
public class ProgressService {

    public ProgressDto getProgress(String userId, String bookId) {
        throw new UnsupportedOperationException("TODO");
    }

    public ProgressDto upsertProgress(String userId, String bookId, ProgressDto dto) {
        throw new UnsupportedOperationException("TODO");
    }
}
