package io.testfly.mcp

object InstallChecker {

    fun isInstalled(): Boolean {
        val checks = listOf(
            listOf("python3", "-c", "import testfly_mcp"),
            listOf("python", "-c", "import testfly_mcp"),
            listOf("pip", "show", "testfly-mcp"),
            listOf("pip3", "show", "testfly-mcp"),
            listOf("python3", "-c", "import selenium_mcp"),
            listOf("python", "-c", "import selenium_mcp"),
            listOf("pip", "show", "seleniumboot-mcp"),
            listOf("pip3", "show", "seleniumboot-mcp"),
        )
        return checks.any { runSilently(it) }
    }

    fun resolveCommand(): String? {
        val candidates = listOf("testfly-mcp", "testfly-mcp3", "seleniumboot-mcp", "seleniumboot-mcp3")
        for (cmd in candidates) {
            val which = if (isWindows()) listOf("where", cmd) else listOf("which", cmd)
            val output = runCapture(which)?.trim()
            if (!output.isNullOrEmpty()) return output.lines().first().trim()
        }
        return null
    }

    fun getInstalledVersion(): String? {
        val script = "import testfly_mcp; from importlib.metadata import version; print(version('testfly-mcp'))"
        return runCapture(listOf("python3", "-c", script))?.trim()
            ?: runCapture(listOf("python", "-c", script))?.trim()
    }

    private fun runSilently(cmd: List<String>): Boolean = try {
        ProcessBuilder(cmd)
            .redirectErrorStream(true)
            .start()
            .waitFor() == 0
    } catch (_: Exception) {
        false
    }

    private fun runCapture(cmd: List<String>): String? = try {
        val proc = ProcessBuilder(cmd).redirectErrorStream(true).start()
        val out = proc.inputStream.bufferedReader().readText()
        if (proc.waitFor() == 0) out else null
    } catch (_: Exception) {
        null
    }

    private fun isWindows() = System.getProperty("os.name").lowercase().contains("win")
}
