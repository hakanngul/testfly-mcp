# TestFly & TestFly MCP — Complete Usage Guide / Kapsamlı Kullanım Kılavuzu

> **Navigation / Hızlı Erişim:**
> - [🇬🇧 English Guide](#english-guide)
> - [🇹🇷 Türkçe Kılavuz](#türkçe-kılavuz)

---

<a name="english-guide"></a>
# 🇬🇧 English Guide

## 1. Overview & Architecture

**TestFly** is a modern, enterprise-grade Selenium WebDriver automation framework for Java, featuring:
- **Zero Boilerplate:** Automated WebDriver lifecycle management (`BaseTest`, `BasePage`, `BaseJUnit5Test`, `BaseCucumberSteps`).
- **Accessibility-First Locators:** `getByRole(Role.BUTTON, "Submit")`, `getByLabel("Email")`, `getByTestId("login-btn")`, `find(...)`.
- **Web-First Assertions:** Auto-waiting fluent assertions with `assertThat(getDriver()).hasTitle(...)`, `hasUrl(...)`, and `assertThat(element).isVisible()`.
- **Resilience:** Built-in self-healing, smart locator fallbacks, automatic retries, and comprehensive reporting.

**TestFly MCP (Model Context Protocol)** connects this Java framework to AI coding assistants (such as **Claude Code**, **JetBrains AI Assistant**, **GitHub Copilot**, and **Antigravity**). It gives AI the power to drive real browsers, observe live DOM & accessibility trees, and emit 100% compliant TestFly Java test code.

### Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                    IDE & AI Assistants                        │
│  IntelliJ IDEA (JetBrains AI)  │  VS Code (Claude / Copilot)  │
└───────────────────────────────┬───────────────────────────────┘
                                │ JSON-RPC / MCP Protocol
┌───────────────────────────────▼───────────────────────────────┐
│                     TestFly MCP Server                        │
│  88 Tools: Browser Control, A11y Inspection, TestFly Codegen  │
│  Interactive Web Studio (http://127.0.0.1:8765) & CLI         │
└───────────────────────────────┬───────────────────────────────┘
                                │ Selenium WebDriver
┌───────────────────────────────▼───────────────────────────────┐
│                      Real Web Browser                         │
│             Google Chrome / Headless Chromium                 │
└───────────────────────────────┬───────────────────────────────┘
                                │ Emits Validated Java Code
┌───────────────────────────────▼───────────────────────────────┐
│                    TestFly Java Project                       │
│    BasePage (POM)  │  BaseTest (TestNG)  │  BaseCucumberSteps │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Installation & Setup

### A. Python MCP Package Installation
Install the local `testfly-mcp` package in editable mode:
```bash
cd /Users/hagul/Projects/TestFramework/testfly-mcp
pip install -e .
```
Verify the installation:
```bash
testfly-mcp --version
# Output: testfly-mcp 1.0.0
```

### B. VS Code Extension Installation
1. Locate the compiled VSIX package:
   `testfly-mcp/vscode-extension/testfly-mcp-1.0.0.vsix`
2. In VS Code, open the **Extensions** view (`Cmd + Shift + X`).
3. Click the `...` (three dots) menu in the top right of the Extensions panel.
4. Select **Install from VSIX...** and select `testfly-mcp-1.0.0.vsix`.
5. The extension will activate automatically and display `$(radio-tower) TestFly MCP` in the Status Bar.

### C. IntelliJ IDEA (JetBrains) Plugin Installation
1. Locate the distribution zip:
   `testfly-mcp/jetbrains-plugin/build/distributions/testfly-mcp-jetbrains-1.0.0.zip`
2. In IntelliJ IDEA, open **Settings / Preferences** (`Cmd + ,`).
3. Select **Plugins** from the left sidebar.
4. Click the **Gear icon (⚙️)** in the top right and select **Install Plugin from Disk...**.
5. Select `testfly-mcp-jetbrains-1.0.0.zip` and click **OK**.
6. Restart the IDE if prompted. The **`Tools → TestFly MCP`** menu will appear.

---

## 3. Command-Line Interface (CLI)

`testfly-mcp` includes a rich CLI:

| Command | Description |
| :--- | :--- |
| `testfly-mcp --help` | Display command-line options and examples. |
| `testfly-mcp --version` | Output current version (`1.0.0`). |
| `testfly-mcp doctor` | Run full environment health checks (Python, Selenium, Chrome, IDE configs). |
| `testfly-mcp tools` | List all 88 MCP tools with parameter counts and descriptions. |
| `testfly-mcp tools --search <term>` | Filter tools by keyword (e.g. `testfly-mcp tools --search codegen`). |
| `testfly-mcp ui` | Launch the **Interactive Web Studio** in your default web browser. |
| `testfly-mcp init-config` | Generate standard `testfly.yml` in the current working directory. |
| `testfly-mcp stdio` | Explicitly start MCP stdio server (auto-detected when piped by IDE/Claude). |
| `testfly-mcp` (in terminal) | Auto-detects human terminal and launches the interactive menu. |

---

## 4. Interactive Web Studio (`testfly-mcp ui`)

Run:
```bash
testfly-mcp ui
```
This launches a zero-dependency, dark-mode web dashboard at `http://127.0.0.1:8765`:

1. **Dashboard:** Live server status, tool counter (88 tools), and quick launch shortcuts.
2. **Browser Playground:**
   - Enter any URL (e.g. `https://www.saucedemo.com`) and click **Go**.
   - Click **Capture Screenshot** to preview the live page state.
   - Click **Get a11y Tree** to inspect accessible element hierarchies.
   - Click or type text directly using selectors or accessible names.
3. **Codegen Studio:**
   - Choose target: **Page Object (`BasePage`)**, **TestNG (`BaseTest`)**, **JUnit 5 (`BaseJUnit5Test`)**, or **Cucumber BDD**.
   - Enter Class Name and Package $\rightarrow$ click **Generate TestFly Code**.
   - Review and copy clean, syntax-highlighted Java code with one click.
4. **Tools Directory:**
   - Search and inspect schemas of all 88 tools.
   - Test-execute any tool with custom JSON arguments directly in your browser.
5. **Visual `testfly.yml` Editor:**
   - Modify browsers, headless modes, thread counts, and timeouts.
   - Live YAML preview with a **Save testfly.yml** button that writes directly to your project root.
6. **Doctor:**
   - Real-time diagnostic verification with status badges and troubleshooting hints.

---

## 5. Connecting AI Assistants

### A. JetBrains AI Assistant (IntelliJ IDEA)
1. Go to **`Tools → TestFly MCP → Check Installation Status & Diagnostics`**.
2. Click **`Register MCP Server with AI Assistant`**.
3. Restart IntelliJ IDEA once.
4. Open the **AI Assistant** chat panel (`Cmd + \` or right panel).
5. Prompt the AI with tasks (see recipes below). It will use TestFly tools automatically.

### B. Claude Code (CLI & VS Code)
The VS Code extension automatically registers `testfly-mcp` in `~/.claude/settings.json`.
Alternatively, add it manually:
```json
{
  "mcpServers": {
    "testfly-mcp": {
      "command": "testfly-mcp",
      "args": ["stdio"]
    }
  }
}
```

---

## 6. AI Prompt Recipes

Use these exact prompts with your AI assistant for best results:

### Recipe 1: Page Object Model (`BasePage`)
> *"Navigate to https://www.saucedemo.com, inspect the login form elements using accessibility locators, and generate a TestFly Page Object named `LoginPage` in package `io.testfly.examples.pages`."*

### Recipe 2: TestNG Test (`BaseTest`)
> *"Write a TestFly TestNG test for SauceDemo login. Log in with username 'standard_user' and password 'secret_sauce', and assert that the title is 'Swag Labs' and the products header has text 'Products'."*

### Recipe 3: Cucumber BDD Feature & Steps
> *"Generate a Gherkin feature file for SauceDemo login and step definitions extending `BaseCucumberSteps` with a runner extending `BaseCucumberTest`."*

---

<br>
<hr style="border: 1px solid #334155; margin: 3rem 0;">
<br>

<a name="türkçe-kılavuz"></a>
# 🇹🇷 Türkçe Kılavuz

## 1. Genel Bakış ve Mimari

**TestFly**, Java dünyası için geliştirilmiş modern ve kurumsal bir Selenium WebDriver test otomasyon çerçevesidir:
- **Sıfır Boilerplate (Şablon Kodsuz):** Otomatik WebDriver yaşam döngüsü (`BaseTest`, `BasePage`, `BaseJUnit5Test`, `BaseCucumberSteps`).
- **Erişilebilirlik Odaklı Locator'lar (a11y-first):** `getByRole(Role.BUTTON, "Giriş Yap")`, `getByLabel("E-posta")`, `getByTestId("submit-btn")`, `find(...)`.
- **Akıllı ve Beklemeli Doğrulamalar:** `assertThat(getDriver()).hasTitle(...)`, `hasUrl(...)` ve `assertThat(element).isVisible()` ile dinamik bekleme yapan akıcı assertion'lar.
- **Dirençli Altyapı:** Yerleşik self-healing (kendi kendini onaran seçiciler), akıllı geri çekilme (fallback), otomatik retry ve zengin HTML raporlama.

**TestFly MCP (Model Context Protocol)**, bu Java çerçevesini yapay zeka asistanlarına (**Claude Code**, **JetBrains AI Assistant**, **GitHub Copilot**, **Antigravity**) bağlayan köprüdür. AI'ın gerçek bir tarayıcıyı kontrol etmesini, DOM ve a11y ağacını okumasını ve projenizle %100 uyumlu TestFly Java kodları üretmesini sağlar.

---

## 2. Kurulum ve Hazırlık

### A. Python MCP Paketinin Kurulması
TestFly MCP paketini geliştirme (editable) modunda kurun:
```bash
cd /Users/hagul/Projects/TestFramework/testfly-mcp
pip install -e .
```
Kurulumu doğrulayın:
```bash
testfly-mcp --version
# Çıktı: testfly-mcp 1.0.0
```

### B. VS Code Eklentisinin Kurulması
1. Derlenmiş paketi bulun:
   `testfly-mcp/vscode-extension/testfly-mcp-1.0.0.vsix`
2. VS Code'da **Extensions** sekmesini açın (`Cmd + Shift + X`).
3. Sağ üstteki `...` (üç nokta) menüsüne tıklayın.
4. **Install from VSIX...** seçeneğini tıklayıp `testfly-mcp-1.0.0.vsix` dosyasını seçin.
5. Eklenti aktifleşecek ve durum çubuğunda (Status Bar) `$(radio-tower) TestFly MCP` simgesi görünecektir.

### C. IntelliJ IDEA (JetBrains) Eklentisinin Kurulması
1. Hazırlanan dağıtım zip dosyasını bulun:
   `testfly-mcp/jetbrains-plugin/build/distributions/testfly-mcp-jetbrains-1.0.0.zip`
2. IntelliJ IDEA'da **Settings / Preferences** (`Cmd + ,`) menüsüne gidin.
3. Sol menüden **Plugins** seçeneğini tıklayın.
4. Sağ üstteki **Dişli çark (⚙️)** ikonuna tıklayıp **Install Plugin from Disk...** deyin.
5. `testfly-mcp-jetbrains-1.0.0.zip` dosyasını seçip **OK** deyin.
6. Gerekirse IDE'yi yeniden başlatın. Üst menüde **`Tools → TestFly MCP`** menüsü belirecektir.

---

## 3. Komut Satırı Kullanımı (CLI)

`testfly-mcp` zengin bir komut satırı arayüzü sunar:

| Komut | Açıklama |
| :--- | :--- |
| `testfly-mcp --help` | Kullanım bilgilerini, komutları ve örnekleri görüntüler. |
| `testfly-mcp --version` | Kurulu sürümü (`1.0.0`) basar. |
| `testfly-mcp doctor` | Python, Selenium, Chrome ve IDE ayarlarını tarayıp teşhis raporu verir. |
| `testfly-mcp tools` | Kullanılabilir 88 MCP aracını parametreleriyle listeler. |
| `testfly-mcp tools --search <kelime>` | Araçlar içinde arama yapar (örn: `testfly-mcp tools --search gherkin`). |
| `testfly-mcp ui` | Tarayıcınızda **Etkileşimli Web Stüdyosu**'nu açar. |
| `testfly-mcp init-config` | Bulunduğunuz dizine standart `testfly.yml` dosyasını oluşturur. |
| `testfly-mcp stdio` | MCP stdio sunucusunu başlatır (IDE/Claude bağlandığında otomatik çalışır). |
| `testfly-mcp` (terminalde doğrudan) | Terminali algılar ve etkileşimli seçim menüsü sunar. |

---

## 4. Etkileşimli Web Stüdyosu (`testfly-mcp ui`)

Terminalinizde şu komutu çalıştırın:
```bash
testfly-mcp ui
```
Tarayıcınızda `http://127.0.0.1:8765` adresinde açılan modern karanlık mod paneli şunları sunar:

1. **Dashboard:** Sunucu durumu, aktif 88 araç sayısı ve hızlı işlem kısayolları.
2. **Browser Playground (Tarayıcı Denetimi):**
   - Hedef URL'yi girip **Go** deyin.
   - **Capture Screenshot** ile canlı ekran görüntüsünü görün.
   - **Get a11y Tree** ile butonların ve inputların erişilebilirlik isimlerini inceleyin.
   - Canlı öğelere tıklayın veya metin yazın.
3. **Codegen Studio (Kod Üretimi):**
   - Şablon seçin: **Page Object (`BasePage`)**, **TestNG (`BaseTest`)**, **JUnit 5 (`BaseJUnit5Test`)** veya **Cucumber BDD**.
   - Sınıf ve paket adını girin $\rightarrow$ **Generate TestFly Code** butonuna basın.
   - Renklendirilmiş Java kodunu tek tıkla kopyalayın.
4. **Tools Directory (Araçlar Rehberi):**
   - 88 aracın açıklamalarını ve JSON şemalarını inceleyin.
   - İstediğiniz aracı doğrudan web arayüzünden test edin.
5. **Görsel `testfly.yml` Editörü:**
   - Tarayıcıyı, paralel koşum tipini, thread sayısını ve timeout'ları form üzerinden seçin.
   - Canlı YAML önizlemesinden **Save testfly.yml** diyerek projenize kaydedin.
6. **Doctor (Sistem Sağlığı):**
   - Python, Selenium, Chrome ve AI bağlantı durumunu anlık kontrol edin.

---

## 5. Yapay Zeka Asistanlarına Bağlanma

### A. JetBrains AI Assistant (IntelliJ IDEA)
1. Üst menüden **`Tools → TestFly MCP → Check Installation Status & Diagnostics`** seçeneğine tıklayın.
2. **`Register MCP Server with AI Assistant`** butonuna basın.
3. IDE'yi bir kez yeniden başlatın.
4. Sağdaki **AI Assistant** chat panelini açıp testlerinizi yazdırmaya başlayın.

### B. Claude Code (Terminal & VS Code)
VS Code eklentisi `~/.claude/settings.json` dosyasına sunucuyu otomatik kaydeder.
Manuel eklemek isterseniz:
```json
{
  "mcpServers": {
    "testfly-mcp": {
      "command": "testfly-mcp",
      "args": ["stdio"]
    }
  }
}
```

---

## 6. Yapay Zeka İçin Hazır Prompt Şablonları

IntelliJ AI Assistant veya Claude Code ile çalışırken aşağıdaki prompt'ları doğrudan kullanabilirsiniz:

### Şablon 1: Page Object Üretimi (`BasePage`)
> *"https://www.saucedemo.com adresine git, giriş formundaki öğeleri a11y locator'larıyla analiz et ve io.testfly.examples.pages paketi altında BasePage extend eden bir LoginPage Page Object sınıfı oluştur."*

### Şablon 2: TestNG Testi Üretimi (`BaseTest`)
> *"SauceDemo giriş akışı için BaseTest extend eden bir TestNG testi yaz. 'standard_user' ve 'secret_sauce' ile login ol, ardından assertThat(getDriver()).hasTitle('Swag Labs') ve ürünler başlığı için assertThat(...).hasText('Products') doğrulamalarını yap."*

### Şablon 3: Cucumber BDD Senaryosu ve Runner
> *"SauceDemo login senaryoları için Gherkin feature dosyası, BaseCucumberSteps extend eden step definitions ve BaseCucumberTest extend eden TestNG runner sınıfı oluştur."*

---

## 7. `testfly.yml` Yapılandırma Referansı

```yaml
# TestFly Yapılandırma Dosyası
execution:
  mode: local                 # local veya grid/cloud
  baseUrl: http://localhost:8080 # Test edilecek varsayılan web adresi
  parallel: methods           # methods, classes veya none
  threadCount: 4              # Eşzamanlı çalışacak thread sayısı
  maxActiveSessions: 4        # İzin verilen maksimum tarayıcı oturumu

browser:
  name: chrome                # chrome, firefox, edge
  headless: false             # CI ortamında true yapabilirsiniz
  lifecycle: per-test         # per-test veya per-class
  captureConsoleErrors: true  # Tarayıcı konsol hatalarını yakala
  arguments:
    - --start-maximized
    - --disable-notifications

retry:
  enabled: true               # Hata alan testleri otomatik tekrar dene
  maxAttempts: 2              # Maksimum deneme sayısı

timeouts:
  explicit: 10                # Akıllı bekleme süresi (saniye)
  pageLoad: 30                # Sayfa yüklenme zaman aşımı (saniye)

reporting:
  html:
    enabled: true             # Zengin HTML raporu üret
    title: TestFly Test Automation Report
```

---

## 8. Sıkça Sorulan Sorular (FAQ)

**S: `testfly-mcp --help` neden kilitlenmişti?**  
*C:* Eski sürümde CLI argüman ayrıştırıcısı olmadığı için, komut satırından çalıştırıldığında doğrudan `stdio` modunda başlatılıyor ve terminalden JSON-RPC mesajı bekliyordu. Yeni `cli.py` yapısıyla argümanlar anında işlenmektedir.

**S: Web Stüdyosu (`testfly-mcp ui`) için ek paket yüklemem gerekir mi?**  
*C:* Hayır! Web stüdyosu Python'un yerleşik `http.server` ve `asyncio` kütüphanelerini kullanır; ekstra hiçbir kütüphane (Flask, FastAPI vb.) kurmanıza gerek yoktur.

**S: Üretilen Java testleri doğrudan derlenir mi?**  
*C:* Evet! TestFly MCP, doğrudan `io.testfly.*` sözleşmelerine göre kod üretir. Manuel `Thread.sleep` veya ham `ChromeDriver` oluşturmaz.
