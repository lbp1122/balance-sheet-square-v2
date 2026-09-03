plugins {
    id("com.android.application")
}

android {
    namespace = "com.lbp.balancesheetsquare"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.lbp.balancesheetsquare"
        minSdk = 24
        targetSdk = 36
        versionCode = 6
        versionName = "2.2.2"
    }

    buildFeatures {
        buildConfig = true
    }

    flavorDimensions += "edition"
    productFlavors {
        create("free") {
            dimension = "edition"
            applicationIdSuffix = ".free"
            versionNameSuffix = "-free"
            buildConfigField("String", "APP_EDITION", "\"free\"")
            resValue("string", "app_name", "Balance Sheet Square Free")
        }
        create("paid") {
            dimension = "edition"
            buildConfigField("String", "APP_EDITION", "\"paid\"")
            resValue("string", "app_name", "Balance Sheet Square")
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".v2test"
            versionNameSuffix = "-v2test"
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
