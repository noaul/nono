import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing lives outside the repository: ~/.nono-android/keystore.properties (or the path in
// NONO_ANDROID_SIGNING) with storeFile, storePassword, keyAlias and keyPassword. Without it the
// release build is produced unsigned.
val signingFile = file(System.getenv("NONO_ANDROID_SIGNING") ?: "${System.getProperty("user.home")}/.nono-android/keystore.properties")
val signing = Properties().apply { if (signingFile.exists()) signingFile.inputStream().use { load(it) } }

// Debug builds may point at a test server: ./gradlew assembleDebug -PnonoDebugBaseUrl=http://10.0.2.2:3000
val productionBaseUrl = "https://noaul.com"
val debugBaseUrl = (findProperty("nonoDebugBaseUrl") as String?) ?: productionBaseUrl

android {
    namespace = "com.noaul.nono"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.noaul.nono"
        minSdk = 29
        targetSdk = 36
        versionCode = 2
        versionName = "0.1.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (signing.isNotEmpty()) {
            create("release") {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "BASE_URL", "\"$debugBaseUrl\"")
            manifestPlaceholders["cleartext"] = debugBaseUrl.startsWith("http://").toString()
            manifestPlaceholders["appLabel"] = "NoNo Debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "BASE_URL", "\"$productionBaseUrl\"")
            manifestPlaceholders["cleartext"] = "false"
            manifestPlaceholders["appLabel"] = "NoNo"
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.webkit:webkit:1.17.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
    testImplementation("androidx.test:core-ktx:1.7.0")
}
