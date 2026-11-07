import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.4.21"
    id("org.jetbrains.intellij.platform") version "2.20.0"
}

group = "zovo.officeviewer"
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(providers.gradleProperty("platformVersion"))
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.opentest4j:opentest4j:1.3.0")
}

kotlin { jvmToolchain(21) }

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}
tasks.withType<JavaCompile> { options.release.set(21) }

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
        // IntelliJ 2025.2 ships the Kotlin 2.1+ standard library: do not call newer stdlib APIs.
        apiVersion.set(KotlinVersion.KOTLIN_2_1)
        languageVersion.set(KotlinVersion.KOTLIN_2_1)
        freeCompilerArgs.add("-Xjdk-release=21")
    }
}

// -Pgate=true adds the real-IDE gate driver (src/gate) for runIde only. Never publish a gate build.
val gate = providers.gradleProperty("gate").orNull == "true"
if (gate) sourceSets["main"].kotlin.srcDir("src/gate/kotlin")

intellijPlatform {
    pluginConfiguration {
        id = "zovo.office-viewer"
        name = "DOCX & PPTX Viewer"
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = provider { null }
        }
        vendor {
            name = "Zovo"
            url = "https://github.com/theluckystrike/office-viewer-jetbrains"
        }
    }
    pluginVerification {
        ides {
            // The 2025.2.6.4 SDK is already in the Gradle cache. Add newer IDEs here when there is disk space.
            create(org.jetbrains.intellij.platform.gradle.IntelliJPlatformType.IntellijIdeaCommunity, "2025.2.6.4")
            providers.gradleProperty("verifyAlso").orNull?.split(',')?.filter { it.isNotBlank() }?.forEach {
                create(org.jetbrains.intellij.platform.gradle.IntelliJPlatformType.IntellijIdea, it.trim())
            }
        }
    }
    publishing {
        // export PUBLISH_TOKEN=<JetBrains Marketplace permanent token>, then ./gradlew publishPlugin
        token = providers.environmentVariable("PUBLISH_TOKEN")
    }
    signing {
        certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("PRIVATE_KEY")
        password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }
    buildSearchableOptions = false
}

tasks {
    // ./gradlew runIde -PdemoProject=<folder>: opens that folder (for example sample .docx and .pptx files) in the sandbox IDE.
    runIde {
        providers.gradleProperty("demoProject").orNull?.let { if (File(it).isDirectory) args(listOf(it)) }
        // -PjcefDebugPort=9334 opens the JCEF DevTools port, so a test script can check the viewer pages.
        providers.gradleProperty("jcefDebugPort").orNull?.let { jvmArgs("-Dide.browser.jcef.debug.port=$it") }
        // skip first-run dialogs (data sharing consent, settings import, trust) so the sandbox opens unattended
        jvmArgs(
            "-Didea.trust.all.projects=true", "-Dide.show.tips.on.startup.default.value=false",
            "-Djb.consents.confirmation.enabled=false", "-Djb.privacy.policy.text=<!--999.999-->",
            "-Didea.initially.ask.config=never", "-Didea.suppress.statistics.report=true", "-Xmx2g",
        )
    }
    if (gate) {
        patchPluginXml {
            doLast {
                val f = outputFile.get().asFile
                f.writeText(f.readText().replace("</extensions>", "  <postStartupActivity implementation=\"zovo.gate.GateDriver\"/>\n  </extensions>"))
            }
        }
        runIde { providers.gradleProperty("gateDir").orNull?.let { jvmArgs("-Dzovo.gate.dir=$it") } }
    }
    test {
        systemProperty("officeviewer.fixtures", layout.projectDirectory.dir("web/test/fixtures").asFile.absolutePath)
    }
    // The viewer bundles in src/main/resources/web are built by `npm run bundle` in web/ and committed,
    // so this Gradle build needs no Node. This check fails the build if they are missing.
    processResources {
        doFirst {
            listOf("docx.js", "pptx.js", "docx.html", "pptx.html", "viewer.css").forEach {
                check(layout.projectDirectory.file("src/main/resources/web/$it").asFile.isFile) { "Missing web/$it: run npm run bundle in web/" }
            }
        }
    }
}
