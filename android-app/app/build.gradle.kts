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
        versionCode = 7
        versionName = "2.3.0"
        resValue("string", "app_name", "Balance Sheet Square")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
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
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
    implementation("androidx.core:core:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.android.billingclient:billing:9.1.0")
}
