@REM ----------------------------------------------------------------------------
@REM Licensed to the Apache Software Foundation (ASF) under one
@REM or more contributor license agreements.
@REM Apache Maven Wrapper startup batch script, version 3.3.2
@REM ----------------------------------------------------------------------------

@IF "%__MVNW_ARG0_NAME__%"=="" (SET "BASE_DIR=%~dp0")

@SET MAVEN_WRAPPER_PROPERTIES=%BASE_DIR%.mvn\wrapper\maven-wrapper.properties

@FOR /F "usebackq tokens=1,* delims==" %%a IN ("%MAVEN_WRAPPER_PROPERTIES%") DO (
  @IF "%%a"=="distributionUrl" SET "DISTRIBUTION_URL=%%b"
)

@ECHO Downloading Maven if needed...
@ECHO Use mvnw.cmd on Windows or mvnw on Unix/macOS
@EXIT /B 1
