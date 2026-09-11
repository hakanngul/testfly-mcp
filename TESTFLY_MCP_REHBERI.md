# ✈️ TestFly MCP — Kapsamlı Yetenek ve Kullanım Rehberi

**TestFly MCP (Model Context Protocol)**, modern web otomasyon çerçevesi **[TestFly](https://github.com/hakanngul/testfly)** ile yapay zeka kodlama asistanlarını (**Claude Code**, **GitHub Copilot**, **Cursor**, **JetBrains AI Assistant**, **Antigravity**) birbirine bağlayan yeni nesil bir test otomasyon ve kod üretim köprüsüdür.

Bu rehber, `testfly-mcp` ile yapabileceğiniz tüm işlemleri, 88 adet MCP aracını, CLI komutlarını, görsel Web Stüdyosu'nu ve CI/CD optimizasyonlarını adım adım ele almaktadır.

---

## 📌 İçindekiler
1. [Temel Mimari ve Çalışma Prensibi](#1-temel-mimari-ve-çalışma-prensibi)
2. [CLI Yetenekleri (Komut Satırı Araçları)](#2-cli-yetenekleri-komut-satırı-araçları)
   - [Proje İskeleti Oluşturma (`testfly init`)](#a-proje-iskeleti-oluşturma-testfly-init)
   - [Akıllı CI/CD Test Bölümleme (`testfly shard`)](#b-akıllı-cicd-test-bölümleme-testfly-shard)
   - [Sistem Teşhisi (`testfly doctor`)](#c-sistem-teşhisi-testfly-doctor)
   - [Etkileşimli Menü ve Konfigürasyon](#d-etkileşimli-menü-ve-konfigürasyon)
3. [88 Adet MCP Aracı ile Yapılabilecekler](#3-88-adet-mcp-aracı-ile-yapılabilecekler)
   - [A. Canlı Tarayıcı Yönetimi (Browser Tools)](#a-canlı-tarayıcı-yönetimi-browser-tools)
   - [B. Öğe Etkileşimi ve Akıllı Arama (Element Tools)](#b-öğe-etkileşimi-ve-akıllı-arama-element-tools)
   - [C. Kendi Kendini Onarma (Self-Healing Locators)](#c-kendi-kendini-onarma-self-healing-locators)
   - [D. Web-First Doğrulamalar (Assertion Tools)](#d-web-first-doğrulamalar-assertion-tools)
   - [E. Çerçeve Uyumlu Test ve Kod Üretimi (Codegen Tools)](#e-çerçeve-uyumlu-test-ve-kod-üretimi-codegen-tools)
4. [Görsel Web Stüdyosu (`testfly studio`)](#4-görsel-web-stüdyosu-testfly-studio)
5. [IDE Eklentileri (VS Code & JetBrains)](#5-ide-eklentileri-vs-code--jetbrains)
6. [Gerçek Dünya Kullanım Senaryoları (Workflows)](#6-gerçek-dünya-kullanım-senaryoları-workflows)

---

## 1. Temel Mimari ve Çalışma Prensibi

TestFly MCP, yapay zekanın web sayfalarını "tahmin ederek" değil, **gerçek bir tarayıcı açıp DOM ve erişilebilirlik (A11y) ağacını gözlemleyerek** test yazmasını sağlar.

```
┌───────────────────────────────────────────────────────────────┐
│                    IDE & AI Asistanları                       │
│  Claude Code  │  Cursor  │  JetBrains AI  │  GitHub Copilot   │
└───────────────────────────────┬───────────────────────────────┘
                                │ JSON-RPC / MCP Protokolü
┌───────────────────────────────▼───────────────────────────────┐
│                     TestFly MCP Server                        │
│  88 Araç: Tarayıcı, Öğe, Doğrulama, Codegen, Sharding         │
│  Interactive Web Studio (http://127.0.0.1:8765) & CLI         │
└───────────────────────────────┬───────────────────────────────┘
                                │ Selenium WebDriver
┌───────────────────────────────▼───────────────────────────────┐
│                      Gerçek Web Tarayıcısı                    │
│             Google Chrome / Headless Chromium                 │
└───────────────────────────────┬───────────────────────────────┘
                                │ Doğrulanmış Java Test Kodu
┌───────────────────────────────▼───────────────────────────────┐
│                    TestFly Java Projesi                       │
│    BasePage (POM)  │  BaseTest (TestNG)  │  BaseCucumberSteps │
└───────────────────────────────────────────────────────────────┘
```

### Öne Çıkan Özellikler:
- **Sıfır Driver Yapılandırması:** Selenium Manager sayesinde ChromeDriver indirme veya PATH ayarlama derdi yoktur.
- **Halüsinasyonsuz Test Üretimi:** AI asistanı sadece sayfada gerçekten var olan buton, input ve metinlerle etkileşime girer; hayali öğeler uydurmaz.
- **TestFly Native Çıktı:** Üretilen kodlar doğrudan TestFly'ın `BaseTest`, `BasePage`, `open("/")`, `assertThat(find(...)).isVisible()` ve erişilebilirlik odaklı (`getByRole`, `getByLabel`, `getByTestId`) API'lerini kullanır.

---

## 2. CLI Yetenekleri (Komut Satırı Araçları)

`testfly-mcp` hem MCP protokolü üzerinden hem de terminalden doğrudan çalıştırılabilen güçlü bir CLI sunar. `testfly` veya `testfly-mcp` komutlarıyla çağrılabilir.

### A. Proje İskeleti Oluşturma (`testfly init`)
Sıfırdan tam teşekküllü, derlenmeye ve koşulmaya hazır bir TestFly otomasyon projesi oluşturur:

```bash
# 1. TestNG tabanlı Web test projesi
testfly init my-web-suite --framework testng --type web --base-url https://qa.example.com

# 2. JUnit 5 tabanlı API test projesi
testfly init my-api-suite --framework junit5 --type api --base-url https://api.example.com

# 3. Cucumber BDD Hibrit (Web + API) projesi
testfly init my-bdd-suite --framework cucumber --type hybrid -g com.mycorp
```

#### Neler Üretir?
- `pom.xml`: `io.github.hakanngul:testfly:1.1.0` ve seçilen test çalıştırıcı (TestNG / JUnit 5 / Cucumber) bağımlılıkları.
- `testfly.yml`: Merkezi yürütme, tarayıcı, zaman aşımı ve raporlama ayarları.
- `.gitignore` & `README.md`: Kullanıma hazır depo ayarları.
- `Sample*Test.java`: Çerçeveye uygun örnek çalışan test sınıfı.

---

### B. Akıllı CI/CD Test Bölümleme (`testfly shard`)
CI/CD pipeline'larında testleri paralel sunuculara dağıtırken yaşanan süre dengesizliklerini çözmek için **LPT (Longest Processing Time) Bin-Packing** algoritması kullanır:

```bash
# 4 paralel sunucudan 0. indexteki sunucu için koşulacak testleri Surefire formatında al
mvn test -Dtest=$(testfly shard --total 4 --index 0 --format surefire)

# Shard dağılımını görsel ASCII dashboard olarak görüntüle
testfly shard --total 3 --index 0 --format dashboard
```

#### Çıktı Formatları:
- `--format surefire`: Maven Surefire için virgüllü sınıf listesi (`LoginTest,PaymentTest`).
- `--format xml` / `testng-xml`: Dinamik TestNG XML suite içeriği.
- `--format json`: Tahmini süreler, makespan ve denge verimlilik yüzdesi.
- `--format dashboard`: Terminal içi görsel özet.

> **İpucu:** `testfly-metrics.json` dosyası mevcut değilse, sistem otomatik olarak `src/test/java` altındaki test sınıflarını tarayarak dengeli bir dağıtım planı üretir.

---

### C. Sistem Teşhisi (`testfly doctor`)
Geliştirme ortamınızın sağlığını denetler:

```bash
testfly doctor
```
- Python sürümü (>= 3.10)
- Selenium paketi ve sürümü
- Google Chrome ikili dosyasının tespiti
- Claude Code / AI istemci konfigürasyon dosyalarının durumu
- Çalışma dizininde `testfly.yml` varlığı

---

### D. Etkileşimli Menü ve Konfigürasyon

```bash
# Etkileşimli terminal menüsünü açar
testfly interactive

# Bulunulan dizine standart testfly.yml oluşturur
testfly init-config --force

# Kullanılabilir tüm araçları arar/listeler
testfly tools --search gherkin
```

---

## 3. 88 Adet MCP Aracı ile Yapılabilecekler

TestFly MCP sunucusu 4 ana kategoride **88 adet özelleşmiş araç** barındırır:

### A. Canlı Tarayıcı Yönetimi (Browser Tools)
Yapay zekaya tam teşekküllü bir tarayıcı kontrol mekanizması sağlar:
- **Oturum Denetimi:** `start_browser`, `close_browser`, `restart_browser`.
- **Gezinme:** `navigate_to`, `go_back`, `go_forward`, `refresh_page`.
- **Ekran ve Görünüm:** `set_window_size`, `maximize_window`, `take_screenshot` (canlı ekran görüntüsünü anında AI'a iletir).
- **DOM & İçerik İnceleme:** `get_page_source`, `get_title`, `get_current_url`, `get_console_logs`.
- **Sekme & Pencere Yönetimi:** `new_tab`, `switch_tab`, `close_tab`.
- **Çerez ve Depolama:** `get_cookies`, `set_cookie`, `delete_cookie`, `delete_all_cookies`, `execute_script` (özel JS çalıştırma).

---

### B. Öğe Etkileşimi ve Akıllı Arama (Element Tools)
Web öğelerini bulur, durumlarını sorgular ve kullanıcı hareketlerini taklit eder:
- **Erişilebilirlik ve Akıllı Seçiciler:** Role, Label, TestId, Text, Placeholder, CSS ve XPath desteği.
- **Tıklama ve Yazma:** `click`, `type_text`, `clear_field`, `press_key`, `send_keys` (Ctrl+A, Enter, Tab, Esc vb. tuş kombinasyonları).
- **Gelişmiş Form Doldurma (`fill_form`):** Tek çağrıda onlarca input, textarea, checkbox, radio ve dropdown'ı doldurup formu gönderebilir.
- **Fare Aksiyonları:** `hover`, `double_click`, `right_click`, `drag_and_drop`.
- **Listeler ve Tablolar:** `select_option` (select elementleri), `get_table_data` (HTML tablolarını yapılandırılmış metin matrisi olarak okur).
- **Zaman Aşımı ve Durum Kontrolleri:** `wait_for_element` (otomatik beklemeli), `is_displayed`, `is_enabled`, `scroll_to_element`.
- **İleri Düzey DOM:** `switch_to_frame`, `switch_to_default_content` (iFrame desteği), `find_shadow_element` (Shadow DOM desteği).
- **Diyaloglar:** `accept_alert`, `dismiss_alert`, `get_alert_text`, `type_in_alert`.
- **Dosya Yükleme:** `upload_file`.

---

### C. Kendi Kendini Onarma (Self-Healing Locators)
Sayfa tasarımı değiştiğinde testlerin kırılmasını engeller:
- `get_healed_locators`: Test sırasında kırılan ve otomatik olarak tamir edilen seçicilerin haritasını görüntüler.
- `clear_healed_locators`: İyileştirilmiş seçici önbelleğini sıfırlar.

---

### D. Web-First Doğrulamalar (Assertion Tools)
Otomatik beklemeli (auto-waiting) ve canlı DOM üzerinde doğrulanan kontroller:
- `assert_title`, `assert_url`: Sayfa başlığı ve URL kontrolleri (tam eşleşme veya içerme).
- `assert_text`: Öğe metni doğrulaması.
- `assert_element_visible`, `assert_element_not_visible`: Görünürlük doğrulaması.
- `assert_attribute`: HTML attribute kontrolleri (`disabled`, `href`, `value` vb.).
- `assert_page_contains`: Sayfa genelinde metin doğrulaması.
- `assert_element_count`: Belirli bir seçiciye uyan öğe adedi kontrolü.

*Not: Assertion araçlarıyla yapılan tüm kontroller kaydedilir ve üretilen Java testlerinde doğrudan `assertThat(...)` web-first assertion kodlarına dönüştürülür.*

---

### E. Çerçeve Uyumlu Test ve Kod Üretimi (Codegen Tools)
Oturum boyunca yapılan tarayıcı hareketlerini analiz ederek üretime hazır test dosyaları üretir:
- `detect_testfly`: Çalışma dizininde TestFly projesi olup olmadığını tespit eder.
- `generate_java_page_object`: **Altın Standart!** Canlı oturumdan bir Page Object (`BasePage`) ve o sayfayı kullanan bir Test sınıfı (`BaseTest`) üretir.
- `generate_java_testng`: TestFly `BaseTest` şablonunda TestNG sınıfı üretir.
- `generate_java_junit5`: TestFly `BaseJUnit5Test` şablonunda JUnit 5 sınıfı üretir.
- `generate_gherkin`: BDD Gherkin `.feature` dosyası, `BaseCucumberSteps` sınıfı ve TestNG Runner üretir.
- `generate_testfly_config`: Oturum parametrelerine göre özelleştirilmiş `testfly.yml` üretir.
- `generate_testfly_pom`: TestFly 1.1.0 uyumlu Maven `pom.xml` üretir.
- **Diğer Diller ve CI:** `generate_python_test` (pytest), `generate_csharp_nunit` (NUnit), `generate_github_actions`, `generate_jenkins_pipeline`, `generate_gitlab_ci`.

---

## 4. Playwright Tarzı Canlı Kod Kaydedici & Inspector (`testfly record` / `testfly studio`)

Playwright Codegen (`playwright codegen`) deneyimini TestFly Java dünyasına getiren yeni nesil interaktif kaydedicidir. Gerçek Google Chrome'da gezinirken tüm tıklama, yazma ve assertion eylemleriniz anlık olarak TestFly koduna dönüştürülür:

```bash
# Doğrudan hedef URL ile başlatma
testfly record https://example.com

# Veya proje kök dizininde testfly.yml'daki baseUrl üzerinden başlatma
testfly record
# (testfly studio ve testfly codegen de aynı modern recorder'ı açar)
```

**[http://127.0.0.1:8765](http://127.0.0.1:8765)** adresinde açılan modern koyu temalı Inspector panelinde:
1. **Gerçek Chrome Entegrasyonu:** Emülasyon değil; gerçek Google Chrome açılır, CDP ile akıllı seçici motoru (`injected_recorder.js`) enjekte edilir.
2. **Playwright-Style Hover Kılavuz Kutusu:** Chrome'da gezinirken fareyle üzerine gelinen eleman mor çerçeveyle vurgulanır ve en uygun TestFly seçicisi rozet olarak gösterilir (`getByRole`, `getByLabel`, `getByTestId`).
3. **Assert Modları (Görünürlük ve Metin Doğrulama):**
   - **Assert Visible:** Tıkladığınız elemanın `assertThat(find(...)).isVisible();` kodunu üretir.
   - **Assert Text:** Elemanın metnini yakalayarak `assertThat(find(...)).hasText("...");` üretir.
4. **Pick Locator:** Tıklanan elemanın TestFly seçicisini tek tıkla panoya kopyalar.
5. **Çoklu Çerçeve Kod Üretimi:**
   - **Page Object Model (`BasePage`):** Eleman lokatörleri ve aksiyon metodları.
   - **TestNG (`BaseTest`):** `@Test` metodları.
   - **JUnit 5 (`BaseJUnit5Test`):** `@Test` ve modern assertions.
   - **Cucumber BDD:** Gherkin senaryosu ve Step Definition metodları.
6. **Save to Project:** Üretilen Java sınıfını tek tıkla projenizin `src/test/java/...` dizinine kaydeder.

---

## 5. IDE Eklentileri (VS Code & JetBrains)

TestFly MCP, en popüler IDE'ler için hazır eklenti paketlerine sahiptir:

| IDE | Dağıtım Dosyası | Sağlanan Özellikler |
|---|---|---|
| **VS Code** | `vscode-extension/testfly-mcp-1.0.0.vsix` | Status Bar ikonu, Web Studio başlatıcı, Claude Code otomatik kayıt, `testfly.yml` initializer. |
| **IntelliJ IDEA** | `jetbrains-plugin/.../testfly-mcp-jetbrains-1.0.0.zip` | `Tools → TestFly MCP` menüsü, JetBrains AI Assistant otomatik MCP kaydı, ortam teşhisi. |

---

## 6. Gerçek Dünya Kullanım Senaryoları (Workflows)

### Senaryo 1: AI Asistanına Canlı Siteden Test Yazdırma
**Kullanıcı İstemi:** *"https://ecommerce.example.com adresine git, sepete bir ürün ekleme akışını test et ve Page Object modelinde TestFly testini üret."*
1. AI asistanı `start_browser` ve `navigate_to` araçlarını çağırır.
2. Sayfayı `take_screenshot` ve `get_page_source` ile inceler.
3. Ürün kartındaki butona `click` yapar, sepete gider ve `assert_element_visible` ile kontrol eder.
4. `generate_java_page_object` aracını çağırır.
5. Sonuç: Hiçbir hayali alan içermeyen, derlenebilir `CartPage.java` ve `CartTest.java` anında projenize yazılır!

### Senaryo 2: CI/CD Süresini %50 Azaltma
Pipeline'ınızda 100 adet test 20 dakika sürüyorsa:
```yaml
# GitHub Actions Matrix Örneği
strategy:
  matrix:
    shardIndex: [0, 1, 2, 3]
steps:
  - name: Run Sharded Tests
    run: |
      TESTS=$(testfly shard --total 4 --index ${{ matrix.shardIndex }} --format surefire)
      mvn test -Dtest=$TESTS
```
LPT Bin-Packing algoritması uzun süren testleri farklı sunuculara dağıtır; 4 sunucu da yaklaşık 5'er dakikada tamamlanarak pipeline süresini 20 dakikadan 5 dakikaya indirir.

---

## 💡 Hızlı Komut Özeti

```bash
# 1. Yeni bir TestFly projesi başlat
testfly init my-automation --framework testng --type web

# 2. Ortam sağlığını doğrula
testfly doctor

# 3. Görsel Web Stüdyosu'nu aç
testfly studio

# 4. CI paralel test dağılımını hesapla
testfly shard --total 3 --index 0 --format surefire

# 5. MCP stdio sunucusunu başlat (AI için)
testfly mcp
```
