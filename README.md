# Reactor Channel Thermal-Hydraulic App

Interactive browser-based 1D reactor-channel thermal-hydraulic solver for engineering and research demonstration.

This project presents a web-based version of a single-channel reactor thermal-hydraulic model. The app calculates axial pressure, coolant temperature, heat-transfer coefficient, wall/cladding/fuel temperature profiles, and provides node-by-node results with CSV export.

## Live Demo

[Open Live Demo](https://reactor-channel-thermal-hydraulic-a.vercel.app/)

## Project Purpose

The purpose of this project is to demonstrate numerical modeling, reactor thermal-hydraulic analysis, and interactive engineering visualization in a lightweight browser-based application.

The app is designed as a research portfolio project for academic and PhD supervisor review.

## Main Features

- Interactive reactor-channel solver in the browser
- Axial pressure profile calculation
- Axial coolant temperature profile calculation
- Volumetric heat-generation profile
- Heat flux calculation
- Reynolds number and friction factor calculation
- Dittus-Boelter heat-transfer correlation
- Convective heat-transfer coefficient calculation
- Cladding outer surface temperature
- Cladding inner surface temperature
- Fuel outer surface temperature
- Fuel centerline temperature
- Exact steam-table property model ported to JavaScript
- Node-by-node results table
- CSV export for further analysis in Excel, MATLAB, or Python

## Model Description

The model represents a 1D heated reactor channel with axial discretization.

The main calculated variables are:

- Pressure, P(z)
- Coolant temperature, T(z)
- Density, rho(z)
- Dynamic viscosity, mu(z)
- Velocity, V(z)
- Reynolds number, Re(z)
- Friction factor, f(z)
- Heat flux, q''(z)
- Heat-transfer coefficient, h(z)
- Cladding and fuel temperature distribution

The axial heat-generation profile is represented using a sinusoidal power shape:

```text
q'''(z) = Q0 sin(pi z / L)
