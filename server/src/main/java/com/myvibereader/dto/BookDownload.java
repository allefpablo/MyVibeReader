package com.myvibereader.dto;

import java.io.InputStream;

public record BookDownload(
    InputStream inputStream,
    String contentType,
    long contentLength,
    String filename
) {}
