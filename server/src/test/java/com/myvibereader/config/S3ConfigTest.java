package com.myvibereader.config;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.services.s3.S3Client;

import static org.assertj.core.api.Assertions.assertThat;

class S3ConfigTest {

    @Test
    void s3Client_standardAwsRegion_createsClientSuccessfully() {
        S3Config config = new S3Config();
        ReflectionTestUtils.setField(config, "region", "us-east-1");
        ReflectionTestUtils.setField(config, "accessKey", "test-access");
        ReflectionTestUtils.setField(config, "secretKey", "test-secret");
        ReflectionTestUtils.setField(config, "endpoint", "");

        S3Client client = config.s3Client();
        assertThat(client).isNotNull();
        client.close();
    }

    @Test
    void s3Client_customEndpointOverride_createsClientSuccessfully() {
        S3Config config = new S3Config();
        ReflectionTestUtils.setField(config, "region", "us-east-1");
        ReflectionTestUtils.setField(config, "accessKey", "test-access");
        ReflectionTestUtils.setField(config, "secretKey", "test-secret");
        ReflectionTestUtils.setField(config, "endpoint", "https://nyc3.digitaloceanspaces.com");

        S3Client client = config.s3Client();
        assertThat(client).isNotNull();
        client.close();
    }
}
