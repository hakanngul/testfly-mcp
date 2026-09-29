package io.testfly.mcp

import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import java.io.File

class TestFlyStartupActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        val basePath = project.basePath ?: return
        val hasYml = File(basePath, "testfly.yml").exists() || File(basePath, "testfly.yaml").exists()

        if (!hasYml) {
            val notification = NotificationGroupManager.getInstance()
                .getNotificationGroup(NOTIFICATION_GROUP)
                ?.createNotification(
                    "TestFly Studio",
                    "Welcome to TestFly Studio! Configure your project with <code>testfly.yml</code> to enable autonomous testing and Playwright MCP.",
                    NotificationType.INFORMATION
                )

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

        if (!MCPRegistrar.isRegistered()) {
            val registered = MCPRegistrar.register("npx", "-y @testfly/mcp")
            if (registered) {
                showNotification(
                    project,
                    "TestFly MCP Bridge registered with AI Assistant. <b>Restart the IDE</b> to activate.",
                    NotificationType.INFORMATION
                )
            }
        }
    }

    private fun showNotification(project: Project, content: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            ?.createNotification("TestFly Studio", content, type)
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
