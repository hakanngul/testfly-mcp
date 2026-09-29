package io.testfly.mcp

import com.intellij.ide.BrowserUtil
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.LocalFileSystem
import java.io.File

private const val DOCS_URL = "https://hakanngul.github.io/testfly"
internal const val NOTIFICATION_GROUP = "TestFly MCP"

private val DEFAULT_TESTFLY_YML = """# TestFly Configuration v1.0.6
execution:
  mode: local
  baseUrl: http://localhost:8080
  parallel: methods
  threadCount: 4
  maxActiveSessions: 4

browser:
  name: chrome
  headless: false
  lifecycle: per-test
  captureConsoleErrors: true
  arguments:
    - --start-maximized
    - --disable-notifications

retry:
  enabled: true
  maxAttempts: 2

timeouts:
  explicit: 10
  pageLoad: 30

reporting:
  html:
    enabled: true
    title: TestFly Test Automation Report

ai:
  provider: gemini
  model: gemini-2.0-flash
  apiKey: ""
  selfHealing:
    enabled: true
    generatePatches: true
""".trimIndent()

class RegisterMCPAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val ok = MCPRegistrar.register("npx", "-y @testfly/mcp")
        if (ok) {
            notify(project, "Registered TestFly MCP Bridge successfully. Restart IDE or AI Assistant to activate.", NotificationType.INFORMATION)
        } else {
            notify(
                project,
                "Could not auto-register. Add manually in <i>Settings → Tools → AI Assistant → MCP Servers</i>. " +
                "Command: <code>npx</code>, Args: <code>-y @testfly/mcp</code>",
                NotificationType.ERROR
            )
        }
    }
}

class CheckStatusAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val basePath = project.basePath ?: return
        val hasYml = File(basePath, "testfly.yml").exists() || File(basePath, "testfly.yaml").exists()
        val hasPom = File(basePath, "pom.xml").exists()
        val cacheFile = File(basePath, ".testfly/action-cache.json")
        val remediationsDir = File(basePath, "target/remediations")

        val cacheCount = if (cacheFile.exists()) {
            val content = cacheFile.readText()
            if (content.contains("goal")) "Active" else "Empty"
        } else "Not initialized"

        val patchCount = if (remediationsDir.exists()) {
            remediationsDir.listFiles { _, name -> name.endsWith(".patch") }?.size ?: 0
        } else 0

        val report = buildString {
            append("<b>TestFly Studio Environment Report</b><br><br>")
            append(if (hasYml) "✓ <code>testfly.yml</code>: <b>Present</b><br>" else "✗ <code>testfly.yml</code>: <b>Missing</b><br>")
            append(if (hasPom) "✓ <code>pom.xml</code>: <b>Present</b><br>" else "✗ <code>pom.xml</code>: <b>Missing</b><br>")
            append("• Action Cache: <b>$cacheCount</b><br>")
            append("• Self-Healing Patches: <b>$patchCount pending</b><br>")
            append("• AI Assistant MCP: <b>Ready via Playwright & TestFly Bridge</b><br>")
        }

        notify(
            project, report,
            if (hasYml && hasPom) NotificationType.INFORMATION else NotificationType.WARNING
        )
    }
}

class InitConfigAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val basePath = project.basePath ?: run {
            notify(project, "No project root directory found.", NotificationType.ERROR)
            return
        }

        val configFile = File(basePath, "testfly.yml")
        if (configFile.exists()) {
            val overwrite = Messages.showYesNoDialog(
                project,
                "testfly.yml already exists in the project root. Overwrite it?",
                "TestFly Configuration",
                Messages.getQuestionIcon()
            ) == Messages.YES
            if (!overwrite) return
        }

        try {
            configFile.writeText(DEFAULT_TESTFLY_YML)
            LocalFileSystem.getInstance().refreshAndFindFileByIoFile(configFile)
            notify(project, "Created <code>testfly.yml</code> in project root.", NotificationType.INFORMATION)
        } catch (ex: Exception) {
            notify(project, "Failed to create testfly.yml: ${ex.message}", NotificationType.ERROR)
        }
    }
}

class OpenDocsAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        BrowserUtil.browse(DOCS_URL)
    }
}

private fun notify(project: Project, content: String, type: NotificationType) {
    NotificationGroupManager.getInstance()
        .getNotificationGroup(NOTIFICATION_GROUP)
        ?.createNotification("TestFly Studio", content, type)
        ?.notify(project)
}
