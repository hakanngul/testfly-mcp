package io.testfly.mcp

object TestFlyTemplates {
    val config: String by lazy {
        requireNotNull(TestFlyTemplates::class.java.getResourceAsStream("/testfly.yml")) {
            "Bundled testfly.yml starter template is missing"
        }.bufferedReader().use { it.readText() }
    }
}
