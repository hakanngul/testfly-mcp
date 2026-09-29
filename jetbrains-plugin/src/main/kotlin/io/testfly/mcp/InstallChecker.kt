package io.testfly.mcp

object InstallChecker {

    fun isNodeInstalled(): Boolean {
        val cmd = if (isWindows()) listOf("cmd", "/c", "node -v") else listOf("node", "-v")
        return runSilently(cmd)
    }

    fun isNpxInstalled(): Boolean {
        val cmd = if (isWindows()) listOf("cmd", "/c", "npx -v") else listOf("npx", "-v")
        return runSilently(cmd)
    }

    fun isJava21Installed(): Boolean {
        val cmd = listOf("java", "-version")
        val out = runCapture(cmd) ?: return false
        return out.contains("21") || out.contains("22") || out.contains("23") || out.contains("24")
    }

    fun resolveCommand(): String {
        return "npx -y @testfly/mcp"
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
