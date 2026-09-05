package io.testfly.mcp

import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

class TestFlyStartupActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        val installed = InstallChecker.isInstalled()

        if (!installed) {
            val notification = NotificationGroupManager.getInstance()
                .getNotificationGroup(NOTIFICATION_GROUP)
                ?.createNotification(
                    "TestFly MCP",
                    "<b>testfly-mcp</b> is not installed. Install it to enable browser automation with JetBrains AI Assistant.",
                    NotificationType.WARNING
                )

            notification?.addAction(NotificationAction.createSimple("Install via pip") {
                InstallAction().actionPerformed(createDummyEvent(project))
                notification.expire()
            })

            notification?.addAction(NotificationAction.createSimple("Initialize testfly.yml") {
                InitConfigAction().actionPerformed(createDummyEvent(project))
                notification.expire()
            })

            notification?.addAction(NotificationAction.createSimple("Docs") {
                OpenDocsAction().actionPerformed(createDummyEvent(project))
            })

            notification?.notify(project)
            return
        }

        val command = InstallChecker.resolveCommand() ?: "testfly-mcp"

        if (!MCPRegistrar.isRegistered()) {
            val registered = MCPRegistrar.register(command)
            if (registered) {
                showNotification(
                    project,
                    "TestFly MCP registered with AI Assistant. <b>Restart the IDE</b> to activate.",
                    NotificationType.INFORMATION
                )
            } else {
                showNotification(
                    project,
                    "TestFly MCP is installed but could not be auto-registered. " +
                    "Go to <b>Tools → TestFly MCP → Register MCP Server</b> or add it manually " +
                    "in <i>Settings → Tools → AI Assistant → MCP Servers</i>.",
                    NotificationType.WARNING
                )
            }
        }
    }

    private fun showNotification(project: Project, content: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            ?.createNotification("TestFly MCP", content, type)
            ?.notify(project)
    }

    private fun createDummyEvent(project: Project): com.intellij.openapi.actionSystem.AnActionEvent {
        val dataContext = com.intellij.openapi.actionSystem.DataContext { dataId ->
            if (com.intellij.openapi.actionSystem.CommonDataKeys.PROJECT.`is`(dataId)) project else null
        }
        return com.intellij.openapi.actionSystem.AnActionEvent.createFromDataContext(
            "TestFlyStartup", null, dataContext
        )
    }
}
