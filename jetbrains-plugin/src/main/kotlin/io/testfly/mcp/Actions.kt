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
import javax.swing.JFileChooser

private const val DOCS_URL = "https://hakanngul.github.io/testfly"
internal const val NOTIFICATION_GROUP = "TestFly MCP"

class RegisterMCPAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val ok = registerLocalBridge(project) ?: return
        if (ok) {
            notify(project, "Registered TestFly MCP Bridge successfully. Restart IDE or AI Assistant to activate.", NotificationType.INFORMATION)
        } else {
            notify(
                project,
                "Could not register the local bridge. Existing MCP settings were not replaced with an empty configuration.",
                NotificationType.ERROR
            )
        }
    }
}

/** Explicit selection and confirmation before editing IDE-wide MCP settings. */
fun registerLocalBridge(project: Project): Boolean? {
    val chooser = JFileChooser().apply {
        dialogTitle = "Select local testfly-mcp.js bridge"
        fileSelectionMode = JFileChooser.FILES_ONLY
    }
    if (chooser.showOpenDialog(null) != JFileChooser.APPROVE_OPTION) return null
    val script = chooser.selectedFile
    if (script.name != "testfly-mcp.js" || !script.isFile) {
        Messages.showErrorDialog(project, "Select the testfly-mcp.js file from your local bridge checkout.", "TestFly MCP")
        return null
    }
    if (Messages.showYesNoDialog(project,
            "Register node \"${script.absolutePath}\" in your IDE-wide MCP configuration? Only the TestFly entry will change.",
            "Configure TestFly MCP", Messages.getQuestionIcon()) != Messages.YES) return null
    return MCPRegistrar.register("node", "\"${script.absolutePath}\"")
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
            configFile.writeText(TestFlyTemplates.config)
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
