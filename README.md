# Adobe Bridge – Clone Rating

Adobe Bridge 시작 스크립트입니다. 한 폴더의 파일에 매긴 별점(star rating)을, 같은 이름(확장자 제외)을 가진 다른 폴더의 파일에 복사합니다.

전형적인 용도: 카메라가 함께 저장한 JPG와 RAW(CR3, RAF, DNG 등) 중 JPG만 보면서 별점을 매긴 뒤, 그 별점을 RAW 파일에 그대로 옮기는 작업입니다.

## 기능

- 소스 폴더와 타깃 폴더를 각각 선택합니다. 폴더 구조에 제한이 없습니다. 같은 폴더를 소스와 타깃으로 골라도 됩니다.
- 소스 폴더 안에 확장자가 여러 종류이면, 어느 확장자의 파일에서 별점을 읽을지 드롭다운으로 고릅니다. 타깃도 마찬가지로 전체 또는 특정 확장자를 고릅니다.
- 파일 포맷에 제한이 없습니다. 짝은 확장자를 뺀 파일 이름으로만 맞춥니다. 대소문자는 구분하지 않습니다.
- 진행 상황, 경고, 요약, 쓰기 결과를 창 하나에서 확인합니다. 읽기가 끝나면 변경 예정 목록을 보여 주고, Write 버튼을 눌러야만 실제로 씁니다.
- 기존 `.xmp` 사이드카는 쓰기 전에 백업합니다. 모든 결과는 CSV 로그로 남깁니다.

## 설치

1. `Clone-Rating.jsx`를 Bridge 시작 스크립트 폴더에 복사합니다.
   - Windows: `%APPDATA%\Adobe\Bridge 2026\Startup Scripts\`
   - macOS: `~/Library/Application Support/Adobe/Bridge 2026/Startup Scripts/`
   - 다른 버전은 폴더 이름의 `2026`을 해당 버전으로 바꿉니다.
2. Bridge > 편집 > 환경 설정 > 시작 스크립트에서 `Clone-Rating`에 체크합니다.
3. Bridge를 완전히 종료한 뒤 다시 실행합니다.
4. 메뉴 `Tools > Clone Rating`이 보이면 설치된 것입니다.

스크립트가 로드되는지 확인하려면 임시 폴더의 `Clone-Rating.load.log`를 봅니다. Windows에서는 `%TEMP%\Clone-Rating.load.log`입니다.

## 사용

1. `Tools > Clone Rating`을 실행합니다.
2. 소스 폴더를 선택합니다. 별점을 읽어 올 폴더입니다.
3. 소스 폴더에 확장자가 둘 이상이면 어느 확장자를 읽을지 고릅니다.
4. 타깃 폴더를 선택합니다. 별점을 써 넣을 폴더입니다.
5. 타깃 확장자를 고릅니다. 기본값은 `All files`입니다.
6. 창에서 `Start reading`을 누릅니다. 읽는 동안 Bridge가 잠시 응답하지 않을 수 있습니다. 진행 상황은 창의 상태줄과 진행 막대, 그리고 타깃 폴더의 `_rating_sync_progress.txt`에 기록됩니다.
7. 요약과 변경 예정 목록을 확인하고 `Write N files`를 누릅니다. `Cancel`을 누르면 아무것도 쓰지 않습니다.

### 별점 처리 규칙

| 소스 별점 | 타깃 별점 | 동작 |
|---|---|---|
| 1~5 | 다름 | 소스 값으로 덮어씀 |
| 1~5 | 같음 | 건너뜀 (Already equal) |
| 0 (없음) | 무엇이든 | 건너뜀. 타깃 별점을 지우지 않음 (`WRITE_ZERO: false`) |
| -1 (거부) | 무엇이든 | 건너뜀 (`SYNC_REJECT: false`) |

- 소스에는 있는데 타깃에 짝이 없는 파일: 별점이 있으면 경고로 표시하고 CSV에 기록합니다. 쓰기는 하지 않습니다.
- 타깃에는 있는데 소스에 짝이 없는 파일: 건수만 요약에 표시합니다.
- 같은 폴더 안에 이름이 같은 파일이 둘 이상이면(예: `a.cr3`와 `a.dng`) 그 이름은 건너뜁니다. 두 파일이 `a.xmp` 사이드카 하나를 공유하기 때문입니다.

### 타깃 폴더에 생기는 파일

- `_rating_sync_progress.txt`: 현재 진행 단계. 실행 중 덮어씁니다.
- `_rating_sync_log_YYYYMMDD_HHMMSS.csv`: 모든 파일의 처리 결과. 열은 `target, source, target_before, source_rating, result`.
- `_rating_sync_backup_YYYYMMDD_HHMMSS/`: 쓰기 전에 존재하던 `.xmp` 사이드카의 사본. 백업할 것이 없으면 폴더를 지웁니다.

이 파일들은 다음 실행 때 짝짓기 대상에서 제외됩니다.

## 설정

스크립트 상단 `CONFIG`에서 바꿉니다.

| 키 | 기본값 | 의미 |
|---|---|---|
| `WRITE_ZERO` | `false` | `true`이면 소스가 별점 없음(0)일 때 타깃 별점도 지웁니다. |
| `SYNC_REJECT` | `false` | `true`이면 소스의 거부(-1) 표시도 타깃에 복사합니다. |
| `BACKUP_XMP` | `true` | 쓰기 전에 기존 `.xmp` 사이드카를 백업합니다. |
| `FAST_READ` | `true` | 별점을 XMP에서 직접 읽습니다. `false`이면 모두 Bridge를 통해 읽습니다. |
| `FAST_READ_CHECK` | `100` | 직접 읽은 값 중 몇 개를 Bridge 값과 대조할지. 하나라도 다르면 전체를 Bridge로 다시 읽습니다. |
| `PROGRESS_FILE` | `true` | 진행 파일 `_rating_sync_progress.txt`를 씁니다. |

## 동작 원리

### 짝짓기

파일 이름에서 마지막 확장자를 떼고 소문자로 바꾼 값을 키로 씁니다. `IMG_0001.JPG`와 `IMG_0001.CR3`는 키 `img_0001`로 같은 짝이 됩니다.

### 별점 읽기

Bridge 별점은 XMP의 `xmp:Rating` 속성입니다. 값의 범위는 -1(거부), 0(없음), 1~5입니다.

소스 파일은 세 단계로 읽습니다.

1. 같은 이름의 `.xmp` 사이드카가 있으면 그 안의 `xmp:Rating`. RAW 파일과, Content Credentials가 들어 있는 JPG가 여기에 해당합니다.
2. 사이드카가 없거나 사이드카에 별점이 없으면 파일 안에 내장된 XMP 패킷(`XMPFile`).
3. 둘 다 실패하면 Bridge의 `Thumbnail.rating`. 느리지만 Bridge가 보는 값 그대로입니다.

직접 읽기는 Bridge의 썸네일과 캐시 작업을 거치지 않아 빠릅니다. 대신 최대 `FAST_READ_CHECK`개를 골라 Bridge 값과 대조하고, 하나라도 다르면 전체를 Bridge로 다시 읽습니다.

소스와 타깃이 같은 폴더이면 `.xmp` 사이드카가 어느 파일 것인지 이름만으로는 알 수 없으므로, 소스 별점은 항상 Bridge를 통해 읽습니다.

타깃 파일은 사이드카를 먼저 읽고, 없을 때만 Bridge에 묻습니다.

### 별점 쓰기

`new Thumbnail(file).rating = value`로 씁니다. Bridge가 파일 포맷에 맞게 `.xmp` 사이드카 또는 파일 내장 XMP에 기록합니다.

쓰기 직후 타깃 파일의 크기와 수정 시각을 비교합니다.

- 사이드카가 있던 파일(RAW)인데 파일 자체가 바뀌면 즉시 중단합니다. RAW 원본은 바뀌면 안 되기 때문입니다.
- 사이드카가 없던 파일(JPG, DNG, TIFF 등)이 바뀌면 내장 XMP에 쓴 것이므로 정상으로 처리합니다.

## 문제 해결

- `Tools` 메뉴에 항목이 없음: 환경 설정 > 시작 스크립트에서 체크가 풀려 있는지 확인합니다. Bridge는 로드에 실패한 스크립트를 다음 실행 때 자동으로 끕니다. `%TEMP%\Clone-Rating.load.log`에 기록이 없으면 스크립트 평가 자체가 실패한 것입니다. 파일이 BOM 없는 UTF-8 또는 ASCII인지, 파일 중간에 비ASCII 문자가 없는지 확인합니다.
- `Error line 1: Cannot convert`: 스크립트 파일 안에 Bridge가 UTF-16으로 변환하지 못하는 문자가 있습니다. 위와 같이 확인합니다.
- 읽는 동안 창이 멈춘 것처럼 보임: 타깃 폴더의 `_rating_sync_progress.txt`로 진행 상황을 확인할 수 있습니다.

## 요구 사항

- Adobe Bridge 2026 (ExtendScript). 다른 버전은 시작 스크립트 폴더 이름만 다릅니다.
- `AdobeXMPScript` 라이브러리. Bridge에 포함되어 있습니다. 없으면 모든 파일을 Bridge를 통해 읽습니다.

## 라이선스

MIT
