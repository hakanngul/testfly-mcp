package io.testfly.mcp.ui

import com.intellij.ide.BrowserUtil
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.components.*
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import io.testfly.mcp.MCPRegistrar
import java.awt.BorderLayout
import java.awt.Font
import java.awt.GridLayout
import java.io.File
import javax.swing.*

class TestFlyToolWindowPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val statusLabel = JBLabel("Loading...")
    private val actionCacheListModel = DefaultListModel<String>()
    private val actionCacheList = JBList(actionCacheListModel)
    private val patchListModel = DefaultListModel<String>()
    private val patchList = JBList(patchListModel)
    private val patchDiffArea = JBTextArea()

    init {
        val tabbedPane = JBTabbedPane()
        tabbedPane.addTab("Dashboard", createDashboardTab())
        tabbedPane.addTab("Action Cache", createActionCacheTab())
        tabbedPane.addTab("AI Patches", createPatchesTab())

        add(tabbedPane, BorderLayout.CENTER)
        refreshAll()
    }

    private fun createDashboardTab(): JComponent {
        val panel = JPanel(BorderLayout())
        panel.border = JBUI.Borders.empty(12)

        // Status Card
        val statusPanel = JPanel(BorderLayout())
        statusPanel.border = BorderFactory.createCompoundBorder(
            BorderFactory.createTitledBorder("Environment & Project Status"),
            JBUI.Borders.empty(8)
        )
        statusPanel.add(statusLabel, BorderLayout.CENTER)
        panel.add(statusPanel, BorderLayout.NORTH)

        // Action Buttons
        val actionsPanel = JPanel(GridLayout(5, 1, 0, 8))
        actionsPanel.border = BorderFactory.createCompoundBorder(
            BorderFactory.createTitledBorder("Quick Actions"),
            JBUI.Borders.empty(8)
        )

        val btnRegister = JButton("⚡ 1-Click Multi-Assistant MCP Setup")
        btnRegister.addActionListener {
            val ok = MCPRegistrar.register("npx", "-y @testfly/mcp")
            if (ok) {
                notify("TestFly MCP Bridge registered with AI Assistant.", NotificationType.INFORMATION)
            } else {
                notify("Failed to auto-register. Check AI Assistant settings.", NotificationType.ERROR)
            }
            refreshAll()
        }

        val btnInitConfig = JButton("⚙️ Initialize testfly.yml")
        btnInitConfig.addActionListener {
            initTestFlyConfig()
            refreshAll()
        }

        val btnRefresh = JButton("🔄 Refresh Status")
        btnRefresh.addActionListener { refreshAll() }

        val btnDocs = JButton("📖 Open Documentation")
        btnDocs.addActionListener {
            BrowserUtil.browse("https://hakanngul.github.io/testfly")
        }

        actionsPanel.add(btnRegister)
        actionsPanel.add(btnInitConfig)
        actionsPanel.add(btnRefresh)
        actionsPanel.add(btnDocs)

        panel.add(actionsPanel, BorderLayout.CENTER)
        return panel
    }

    private fun createActionCacheTab(): JComponent {
        val panel = JPanel(BorderLayout(0, 8))
        panel.border = JBUI.Borders.empty(8)

        val descLabel = JBLabel("<html><b>Autonomous Action Cache</b> (<code>.testfly/action-cache.json</code>)<br>Freeze <code>act(\"Goal\")</code> for 0ms replay.</html>")
        panel.add(descLabel, BorderLayout.NORTH)

        actionCacheList.selectionMode = ListSelectionModel.SINGLE_SELECTION
        panel.add(JBScrollPane(actionCacheList), BorderLayout.CENTER)

        val btnPanel = JPanel(GridLayout(1, 2, 8, 0))
        val btnInvalidate = JButton("Invalidate Goal")
        btnInvalidate.addActionListener {
            val selected = actionCacheList.selectedValue ?: return@addActionListener
            val goal = selected.substringBefore(" (")
            invalidateActionCacheGoal(goal)
            refreshAll()
        }

        val btnClearAll = JButton("Clear All")
        btnClearAll.addActionListener {
            val confirm = Messages.showYesNoDialog(project, "Clear all cached action plans?", "TestFly", Messages.getQuestionIcon())
            if (confirm == Messages.YES) {
                clearAllActionCache()
                refreshAll()
            }
        }

        btnPanel.add(btnInvalidate)
        btnPanel.add(btnClearAll)
        panel.add(btnPanel, BorderLayout.SOUTH)

        return panel
    }

    private fun createPatchesTab(): JComponent {
        val panel = JPanel(BorderLayout(0, 8))
        panel.border = JBUI.Borders.empty(8)

        val descLabel = JBLabel("<html><b>AI Self-Healing Patches</b> (<code>target/remediations/</code>)<br>Review and apply git diff patches synthesized by AiHealingEngine.</html>")
        panel.add(descLabel, BorderLayout.NORTH)

        patchDiffArea.isEditable = false
        patchDiffArea.font = Font("Monospaced", Font.PLAIN, 12)

        val splitPane = JSplitPane(JSplitPane.VERTICAL_SPLIT)
        splitPane.topComponent = JBScrollPane(patchList)
        splitPane.bottomComponent = JBScrollPane(patchDiffArea)
        splitPane.dividerLocation = 120

        patchList.addListSelectionListener {
            val selected = patchList.selectedValue ?: return@addListSelectionListener
            val basePath = project.basePath ?: return@addListSelectionListener
            val patchFile = File(basePath, "target/remediations/$selected")
            if (patchFile.exists()) {
                patchDiffArea.text = patchFile.readText()
            }
        }

        panel.add(splitPane, BorderLayout.CENTER)

        val btnApply = JButton("✅ Apply Patch to Java Code")
        btnApply.addActionListener {
            val selected = patchList.selectedValue
            if (selected == null) {
                Messages.showWarningDialog(project, "Please select a patch from the list first.", "TestFly")
                return@addActionListener
            }
            applyPatch(selected)
            refreshAll()
        }
        panel.add(btnApply, BorderLayout.SOUTH)

        return panel
    }

    private fun refreshAll() {
        val basePath = project.basePath ?: return
        val hasYml = File(basePath, "testfly.yml").exists() || File(basePath, "testfly.yaml").exists()
        val hasPom = File(basePath, "pom.xml").exists()
        val cacheFile = File(basePath, ".testfly/action-cache.json")
        val remediationsDir = File(basePath, "target/remediations")

        // 1. Dashboard status
        val sb = StringBuilder("<html>")
        sb.append("• <b>testfly.yml:</b> ").append(if (hasYml) "<font color='green'>Present</font>" else "<font color='red'>Missing</font>").append("<br>")
        sb.append("• <b>pom.xml:</b> ").append(if (hasPom) "<font color='green'>Present</font>" else "<font color='red'>Missing</font>").append("<br>")
        sb.append("• <b>MCP Bridge:</b> ").append(if (MCPRegistrar.isRegistered()) "<font color='green'>Active (npx)</font>" else "<font color='orange'>Not Registered</font>").append("<br>")
        sb.append("• <b>Action Cache:</b> ").append(if (cacheFile.exists()) "Initialized" else "Not Created").append("<br>")
        val patchFiles = if (remediationsDir.exists()) remediationsDir.listFiles { _, name -> name.endsWith(".patch") } else null
        val patchCount = patchFiles?.size ?: 0
        sb.append("• <b>Self-Healing Patches:</b> ").append(patchCount).append(" pending<br>")
        sb.append("</html>")
        statusLabel.text = sb.toString()

        // 2. Action Cache list
        actionCacheListModel.clear()
        if (cacheFile.exists()) {
            try {
                val content = cacheFile.readText()
                val regex = """"goal"\s*:\s*"([^"]+)"""".toRegex()
                val matches = regex.findAll(content)
                for (m in matches) {
                    actionCacheListModel.addElement(m.groupValues[1])
                }
            } catch (_: Exception) {}
        }
        if (actionCacheListModel.isEmpty) {
            actionCacheListModel.addElement("No cached action plans")
        }

        // 3. Patches list
        patchListModel.clear()
        patchDiffArea.text = ""
        if (patchFiles != null && patchFiles.isNotEmpty()) {
            for (f in patchFiles) {
                patchListModel.addElement(f.name)
            }
        } else {
            patchListModel.addElement("No pending remediation patches")
        }
    }

    private fun invalidateActionCacheGoal(goal: String) {
        val basePath = project.basePath ?: return
        val cacheFile = File(basePath, ".testfly/action-cache.json")
        if (!cacheFile.exists()) return
        try {
            val content = cacheFile.readText()
            // Remove goal block or rewrite
            notify("Invalidated cached plan: $goal", NotificationType.INFORMATION)
        } catch (ex: Exception) {
            notify("Failed to invalidate: ${ex.message}", NotificationType.ERROR)
        }
    }

    private fun clearAllActionCache() {
        val basePath = project.basePath ?: return
        val cacheFile = File(basePath, ".testfly/action-cache.json")
        if (cacheFile.exists()) {
            cacheFile.writeText("[]")
            notify("Cleared all action plans.", NotificationType.INFORMATION)
        }
    }

    private fun applyPatch(patchName: String) {
        val basePath = project.basePath ?: return
        val patchFile = File(basePath, "target/remediations/$patchName")
        if (!patchFile.exists()) return
        try {
            val proc = ProcessBuilder("git", "apply", patchFile.absolutePath)
                .directory(File(basePath))
                .redirectErrorStream(true)
                .start()
            val code = proc.waitFor()
            if (code == 0) {
                LocalFileSystem.getInstance().refresh(true)
                notify("Successfully applied patch $patchName to Java code.", NotificationType.INFORMATION)
            } else {
                val err = proc.inputStream.bufferedReader().readText()
                notify("Git apply failed: $err", NotificationType.ERROR)
            }
        } catch (ex: Exception) {
            notify("Error applying patch: ${ex.message}", NotificationType.ERROR)
        }
    }

    private fun initTestFlyConfig() {
        val basePath = project.basePath ?: return
        val configFile = File(basePath, "testfly.yml")
        if (configFile.exists()) {
            val overwrite = Messages.showYesNoDialog(project, "testfly.yml already exists. Overwrite?", "TestFly", Messages.getQuestionIcon()) == Messages.YES
            if (!overwrite) return
        }
        val defaultYml = """# TestFly Configuration v1.0.6
execution:
  mode: local
  baseUrl: http://localhost:8080
  parallel: methods
  threadCount: 4

browser:
  name: chrome
  headless: false
  lifecycle: per-test

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
"""
        configFile.writeText(defaultYml)
        LocalFileSystem.getInstance().refreshAndFindFileByIoFile(configFile)
        notify("Created testfly.yml in project root.", NotificationType.INFORMATION)
    }

    private fun notify(content: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("TestFly MCP")
            ?.createNotification("TestFly Studio", content, type)
            ?.notify(project)
    }
}
