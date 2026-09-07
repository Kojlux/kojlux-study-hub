package com.kojlux.studyhub;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		SplashScreen.installSplashScreen(this);
		super.onCreate(savedInstanceState);
		showBrandedLaunchOverlay();
	}

	private void showBrandedLaunchOverlay() {
		boolean isDark = (getResources().getConfiguration().uiMode
				& Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
		int backgroundColor = isDark ? Color.rgb(15, 23, 42) : Color.WHITE;
		int foregroundColor = isDark ? Color.WHITE : Color.rgb(15, 23, 42);

		FrameLayout overlay = new FrameLayout(this);
		overlay.setBackgroundColor(backgroundColor);
		overlay.setAlpha(1f);

		ImageView icon = new ImageView(this);
		icon.setImageResource(R.mipmap.ic_launcher);
		icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
		FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(
				dp(220), dp(220), Gravity.CENTER);
		iconParams.bottomMargin = dp(24);
		overlay.addView(icon, iconParams);

		TextView title = new TextView(this);
		title.setText("KOJLUX STUDY HUB");
		title.setTextColor(foregroundColor);
		title.setTextSize(18);
		title.setGravity(Gravity.CENTER);
		title.setTypeface(null, android.graphics.Typeface.BOLD);
		FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
				ViewGroup.LayoutParams.MATCH_PARENT, dp(32), Gravity.BOTTOM);
		titleParams.leftMargin = dp(24);
		titleParams.rightMargin = dp(24);
		titleParams.bottomMargin = dp(32);
		overlay.addView(title, titleParams);

		addContentView(overlay, new ViewGroup.LayoutParams(
				ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

		new Handler(Looper.getMainLooper()).postDelayed(() -> {
			overlay.animate().alpha(0f).setDuration(220).withEndAction(() -> {
				ViewGroup parent = (ViewGroup) overlay.getParent();
				if (parent != null) {
					parent.removeView(overlay);
				}
			}).start();
		}, 3200);
	}

	private int dp(int value) {
		return Math.round(value * getResources().getDisplayMetrics().density);
	}
}
