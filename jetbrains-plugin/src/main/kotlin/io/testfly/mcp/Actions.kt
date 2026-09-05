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

private const val INSTALL_CMD = "pip install testfly-mcp"
private const val UPGRADE_CMD = "pip install --upgrade testfly-mcp"
private const val DOCS_URL = "https://github.com/seleniumboot/selenium-mcp"
internal const val NOTIFICATION_GROUP = "TestFly MCP"

private const val DEFAULT_TESTFLY_YML = """# TestFly Configuration
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
"""

class InstallAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        runPipCommand(project, INSTALL_CMD)
    }
}

class UpgradeAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        runPipCommand(project, UPGRADE_CMD)
    }
}

class RegisterMCPAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val command = InstallChecker.resolveCommand() ?: "testfly-mcp"
        val ok = MCPRegistrar.register(command)
        if (ok) {
            notify(project, "Registered TestFly MCP successfully. Restart the IDE to activate with AI Assistant.", NotificationType.INFORMATION)
        } else {
            notify(
                project,
                "Could not auto-register. Add manually in <i>Settings → Tools → AI Assistant → MCP Servers</i>. " +
                "Command: <code>testfly-mcp</code>",
                NotificationType.ERROR
            )
        }
    }
}

class CheckStatusAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val installed = InstallChecker.isInstalled()
        val registered = MCPRegistrar.isRegistered()
        val command = InstallChecker.resolveCommand() ?: "Not found in PATH"
        val version = InstallChecker.getInstalledVersion() ?: "Unknown"

        val report = buildString {
            append("<b>TestFly MCP Diagnostic Report</b><br><br>")
            append(if (installed) "✓ Python package: <b>Installed</b> (v$version)<br>" else "✗ Python package: <b>NOT installed</b><br>")
            append("• CLI Command: <code>$command</code><br>")
            append(if (registered) "✓ AI Assistant Registration: <b>Active</b><br>" else "✗ AI Assistant Registration: <b>Not registered</b><br>")
        }

        notify(
            project, report,
            if (installed && registered) NotificationType.INFORMATION else NotificationType.WARNING
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

private fun runPipCommand(project: Project, command: String) {
    try {
        val isWindows = System.getProperty("os.name").lowercase().contains("win")
        val proc = if (isWindows) {
            ProcessBuilder("cmd", "/c", command)
        } else {
            ProcessBuilder("bash", "-c", command)
        }
        proc.redirectErrorStream(true).start()
        notify(project, "Running: <code>$command</code> — check terminal for installation progress.", NotificationType.INFORMATION)
    } catch (ex: Exception) {
        notify(project, "Failed to run: $command<br>${ex.message}", NotificationType.ERROR)
    }
}

private fun notify(project: Project, content: String, type: NotificationType) {
    NotificationGroupManager.getInstance()
        .getNotificationGroup(NOTIFICATION_GROUP)
        ?.createNotification("TestFly MCP", content, type)
        ?.notify(project)
}
