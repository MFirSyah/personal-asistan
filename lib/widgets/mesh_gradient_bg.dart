import 'dart:ui';
import 'package:flutter/material.dart';

class MeshGradientBg extends StatelessWidget {
  final Widget child;

  const MeshGradientBg({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: const BoxDecoration(
        color: Color(0xFF0B0F19), // Midnight Dark Base
      ),
      child: Stack(
        children: [
          // Top right subtle glow
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFC0C1FF).withValues(alpha: 0.15),
              ),
            ),
          ),
          // Bottom left subtle glow
          Positioned(
            bottom: -100,
            left: -100,
            child: Container(
              width: 350,
              height: 350,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFDDB7FF).withValues(alpha: 0.10),
              ),
            ),
          ),
          // Blur filter to blend gradients into mesh
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),
              child: Container(
                color: Colors.transparent,
              ),
            ),
          ),
          // Actual content
          SafeArea(child: child),
        ],
      ),
    );
  }
}
